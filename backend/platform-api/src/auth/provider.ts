import { readOptional, readRequired } from '../config';
import type { ProviderName } from '../db/entities/identity.entity';
import { GithubProvider } from './github.provider';
import { GoogleProvider } from './google.provider';

export type { ProviderName };

/**
 * The providers this platform can sign in with. Narrower than `ProviderName`, which is the union the
 * `identities` column holds: a way in that is not a provider is still a row there, but it is never a
 * button on the title screen.
 */
export type OAuthProviderName = 'github' | 'google';

/**
 * What a provider has to answer, and the only thing the rest of the platform learns about a player from
 * it. Nothing here is provider-specific: GitHub through `openid-client` and the fake the tests use are
 * interchangeable behind this interface.
 */
export interface ProviderProfile {
  /** The provider's own identifier for the player — a GitHub numeric id, a Google `sub`. */
  providerUserId: string;
  /**
   * `null` is a real answer and not an error: GitHub exposes no address when the account keeps it
   * private, and a profile with no address takes the new-account path of the linking rule.
   */
  email: string | null;
  /** Whether the provider vouched for that address. Only a `true` here can ever link two accounts. */
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

export interface OAuthProvider {
  readonly name: OAuthProviderName;
  /** Where the browser goes, with the PKCE challenge and the state already in it. */
  authorizationUrl(state: string, codeChallenge: string): string;
  /** The profile behind the code the provider sent back. Throws when the exchange fails. */
  exchange(code: string, codeVerifier: string): Promise<ProviderProfile>;
}

/** Partial, because a deployment may configure one provider or none at all (§ 8, D7). */
export type OAuthProviders = Partial<Record<OAuthProviderName, OAuthProvider>>;

/** Injected as a value, so a test can put two providers of its own in its place. */
export const OAUTH_PROVIDERS = 'OAUTH_PROVIDERS';

/**
 * The order the buttons are drawn in and the order `GET /auth/providers` answers in. Written down rather
 * than taken from the object's own order, so that the list does not move between two deployments that
 * differ only in which providers they have.
 */
export const PROVIDER_NAMES: readonly OAuthProviderName[] = ['github', 'google'];

/** Where each provider's two halves are spelled in the environment. */
const CREDENTIAL_VARIABLES: Record<OAuthProviderName, { idVariable: string; secretVariable: string }> = {
  github: { idVariable: 'OAUTH_GITHUB_CLIENT_ID', secretVariable: 'OAUTH_GITHUB_CLIENT_SECRET' },
  google: { idVariable: 'OAUTH_GOOGLE_CLIENT_ID', secretVariable: 'OAUTH_GOOGLE_CLIENT_SECRET' },
};

/** What both providers' constructors take, spelled once so the factory below reads as one shape. */
interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** A provider's two halves once the environment has answered for both of them. */
interface Credential {
  name: OAuthProviderName;
  clientId: string;
  clientSecret: string;
}

/**
 * The providers this deployment signs in with, built from the environment while the container starts.
 *
 * A provider that is not configured is a provider that is off: it is not built, it is not in the list
 * `GET /auth/providers` answers with, and `GET /auth/<name>` answers 404. That is what lets the project
 * run with no OAuth application at all — the state a person cloning the repository is in, and the state
 * CI runs in (§ 8, D7).
 */
export function oauthProvidersFromEnvironment(): OAuthProviders {
  const configured = PROVIDER_NAMES.map(credentialOf).filter(
    (one): one is Credential => one !== undefined,
  );
  if (configured.length === 0) return {};

  // Read only once there is a callback to compose it into: with nothing configured there is no URI to
  // build, and demanding the base would make a feature that is off a requirement to boot.
  const redirectBaseUrl = readRequired(process.env.OAUTH_REDIRECT_BASE_URL, 'OAUTH_REDIRECT_BASE_URL');

  const providers: OAuthProviders = {};
  for (const { name, clientId, clientSecret } of configured) {
    providers[name] = build(name, {
      clientId,
      clientSecret,
      redirectUri: `${redirectBaseUrl}/auth/${name}/callback`,
    });
  }
  return providers;
}

/**
 * One provider's credential, or nothing when the environment does not configure it.
 *
 * Half a pair is refused here, while the container is being built. The two halves are never
 * deliberately split, so one without the other is a typo — and a typo that surfaced at the first
 * sign-in would read as the provider's own fault rather than as a missing line in `.env`.
 */
function credentialOf(name: OAuthProviderName): Credential | undefined {
  const { idVariable, secretVariable } = CREDENTIAL_VARIABLES[name];
  const clientId = readOptional(process.env[idVariable]);
  const clientSecret = readOptional(process.env[secretVariable]);

  if (clientId === undefined && clientSecret === undefined) return undefined;
  if (clientId === undefined || clientSecret === undefined) {
    const missing = clientId === undefined ? idVariable : secretVariable;
    throw new Error(
      `${idVariable} and ${secretVariable} must be set together, or neither of them: ${missing} is the one that is missing`,
    );
  }
  return { name, clientId, clientSecret };
}

function build(name: OAuthProviderName, config: ProviderConfig): OAuthProvider {
  return name === 'github' ? new GithubProvider(config) : new GoogleProvider(config);
}
