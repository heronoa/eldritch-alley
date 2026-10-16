import { readRequired } from '../config';
import type { ProviderName } from '../db/entities/identity.entity';
import { GithubProvider } from './github.provider';
import { GoogleProvider } from './google.provider';

export type { ProviderName };

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
  readonly name: ProviderName;
  /** Where the browser goes, with the PKCE challenge and the state already in it. */
  authorizationUrl(state: string, codeChallenge: string): string;
  /** The profile behind the code the provider sent back. Throws when the exchange fails. */
  exchange(code: string, codeVerifier: string): Promise<ProviderProfile>;
}

export type OAuthProviders = Record<ProviderName, OAuthProvider>;

/** Injected as a value, so a test can put two providers of its own in its place. */
export const OAUTH_PROVIDERS = 'OAUTH_PROVIDERS';

/** The providers this deployment signs in with, built from the environment while the container starts. */
export function oauthProvidersFromEnvironment(): OAuthProviders {
  const redirectBaseUrl = readRequired(process.env.OAUTH_REDIRECT_BASE_URL, 'OAUTH_REDIRECT_BASE_URL');

  return {
    github: new GithubProvider({
      clientId: readRequired(process.env.OAUTH_GITHUB_CLIENT_ID, 'OAUTH_GITHUB_CLIENT_ID'),
      clientSecret: readRequired(process.env.OAUTH_GITHUB_CLIENT_SECRET, 'OAUTH_GITHUB_CLIENT_SECRET'),
      redirectUri: `${redirectBaseUrl}/auth/github/callback`,
    }),
    google: new GoogleProvider({
      clientId: readRequired(process.env.OAUTH_GOOGLE_CLIENT_ID, 'OAUTH_GOOGLE_CLIENT_ID'),
      clientSecret: readRequired(process.env.OAUTH_GOOGLE_CLIENT_SECRET, 'OAUTH_GOOGLE_CLIENT_SECRET'),
      redirectUri: `${redirectBaseUrl}/auth/google/callback`,
    }),
  };
}
