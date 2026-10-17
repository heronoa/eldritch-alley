import { readOptional, readRequired } from '../config';
import type { ProviderName } from '../db/entities/identity.entity';
import { GithubProvider } from './github.provider';
import { GoogleProvider } from './google.provider';
import { KeycloakProvider } from './keycloak.provider';

export type { ProviderName };

/**
 * The providers this platform can sign in with. Narrower than `ProviderName`, which is the union the
 * `identities` column holds: a way in that is not a provider is still a row there, but it is never a
 * button on the title screen.
 */
export type OAuthProviderName = 'github' | 'google' | 'keycloak';

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
 * differ only in which providers they have. Keycloak comes first so that a realm, which is the newest
 * way in, does not push the familiar buttons down the dialog.
 */
export const PROVIDER_NAMES: readonly OAuthProviderName[] = ['keycloak', 'github', 'google'];

/** The providers a deployment can configure directly, when it has no realm in front of them. */
type DirectProviderName = Exclude<OAuthProviderName, 'keycloak'>;

const DIRECT_PROVIDER_NAMES: readonly DirectProviderName[] = ['github', 'google'];

/** Where each direct provider's two halves are spelled in the environment. */
const CREDENTIAL_VARIABLES: Record<DirectProviderName, { idVariable: string; secretVariable: string }> = {
  github: { idVariable: 'OAUTH_GITHUB_CLIENT_ID', secretVariable: 'OAUTH_GITHUB_CLIENT_SECRET' },
  google: { idVariable: 'OAUTH_GOOGLE_CLIENT_ID', secretVariable: 'OAUTH_GOOGLE_CLIENT_SECRET' },
};

/**
 * Keycloak takes a third value the direct providers do not: the issuer, which is the realm's own URL and
 * is what the ID token has to name. The three are written here so that the error below can list them.
 */
const KEYCLOAK_CLIENT_ID = 'OAUTH_KEYCLOAK_CLIENT_ID';
const KEYCLOAK_CLIENT_SECRET = 'OAUTH_KEYCLOAK_CLIENT_SECRET';
const KEYCLOAK_ISSUER = 'OAUTH_KEYCLOAK_ISSUER';

interface KeycloakSettings {
  clientId: string;
  clientSecret: string;
  issuer: string;
}

/** What both providers' constructors take, spelled once so the factory below reads as one shape. */
interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** A provider's two halves once the environment has answered for both of them. */
interface Credential {
  name: DirectProviderName;
  clientId: string;
  clientSecret: string;
}

/**
 * The providers this deployment signs in with, built from the environment while the container starts.
 *
 * Every credential stands on its own: a provider that is configured is built, and a provider that is
 * not is off — not in the list `GET /auth/providers` answers with, and `GET /auth/<name>` answers 404.
 * That is what lets the project run with no OAuth application at all, the state a person cloning the
 * repository is in and the state CI runs in (§ 8, D7).
 *
 * The realm is one more entry in that rule, not a switch over it. When its three values are set,
 * Keycloak is built beside whichever direct providers are configured; when they are absent it is off
 * and the direct providers are untouched. The owner wants each button to follow its own configuration:
 * putting a realm in front of the deployment must not hide the apps that are already there.
 */
export function oauthProvidersFromEnvironment(): OAuthProviders {
  const providers: OAuthProviders = {};

  const keycloak = keycloakSettings();
  if (keycloak !== undefined) {
    providers.keycloak = new KeycloakProvider({ ...keycloak, redirectUri: callbackUrl('keycloak') });
  }

  for (const { name, clientId, clientSecret } of DIRECT_PROVIDER_NAMES.map(credentialOf).filter(
    (one): one is Credential => one !== undefined,
  )) {
    providers[name] = build(name, {
      clientId,
      clientSecret,
      redirectUri: callbackUrl(name),
    });
  }

  return providers;
}

/**
 * The callback the browser is sent back to, composed from the one base the deployment declares.
 *
 * The base is read only once there is a provider to build a callback for: with nothing configured there
 * is no URI to compose, and demanding the base would make a feature that is off a requirement to boot.
 */
function callbackUrl(name: OAuthProviderName): string {
  const base = readRequired(process.env.OAUTH_REDIRECT_BASE_URL, 'OAUTH_REDIRECT_BASE_URL');
  return `${base}/auth/${name}/callback`;
}

/**
 * Keycloak's three values, or nothing when the environment does not configure it.
 *
 * Half a set is refused here, while the container is being built, and the refusal names what is
 * missing. The three are never deliberately split, so some without the rest is a typo — and a typo that
 * surfaced at the first sign-in would read as the provider's own fault rather than as a missing line in
 * `.env`. The check runs before the direct providers are looked at, which is what makes a half-filled
 * Keycloak stop the boot instead of quietly behaving as though the realm were off.
 */
function keycloakSettings(): KeycloakSettings | undefined {
  const clientId = readOptional(process.env[KEYCLOAK_CLIENT_ID]);
  const clientSecret = readOptional(process.env[KEYCLOAK_CLIENT_SECRET]);
  const issuer = readOptional(process.env[KEYCLOAK_ISSUER]);

  if (clientId === undefined && clientSecret === undefined && issuer === undefined) return undefined;

  if (clientId === undefined || clientSecret === undefined || issuer === undefined) {
    const missing = [
      ...(clientId === undefined ? [KEYCLOAK_CLIENT_ID] : []),
      ...(clientSecret === undefined ? [KEYCLOAK_CLIENT_SECRET] : []),
      ...(issuer === undefined ? [KEYCLOAK_ISSUER] : []),
    ];
    throw new Error(
      `${KEYCLOAK_CLIENT_ID}, ${KEYCLOAK_CLIENT_SECRET} and ${KEYCLOAK_ISSUER} must be set together, or none of them: ${missing.join(', ')} ${missing.length === 1 ? 'is the one that is missing' : 'are the ones that are missing'}`,
    );
  }

  return { clientId, clientSecret, issuer };
}

/**
 * One provider's credential, or nothing when the environment does not configure it.
 *
 * Half a pair is refused here, while the container is being built. The two halves are never
 * deliberately split, so one without the other is a typo — and a typo that surfaced at the first
 * sign-in would read as the provider's own fault rather than as a missing line in `.env`.
 */
function credentialOf(name: DirectProviderName): Credential | undefined {
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

function build(name: DirectProviderName, config: ProviderConfig): OAuthProvider {
  return name === 'github' ? new GithubProvider(config) : new GoogleProvider(config);
}
