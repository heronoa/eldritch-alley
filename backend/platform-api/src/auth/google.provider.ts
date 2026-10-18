import {
  ClientSecretPost,
  Configuration,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  skipStateCheck,
} from 'openid-client';
import type { OAuthProvider, ProviderProfile } from './provider';

const ISSUER = 'https://accounts.google.com';
const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

const SCOPE = 'openid email profile';

type ServerMetadata = ConstructorParameters<typeof Configuration>[0];

export interface GoogleProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Google, through the same OpenID Connect the client library knows: the ID token it returns carries the
 * address, whether Google verified it, the name and the picture, and the library checks the token's
 * signature and its issuer, audience and expiry before any of it is read.
 */
export class GoogleProvider implements OAuthProvider {
  readonly name = 'google' as const;

  private readonly configuration: Configuration;

  constructor(private readonly config: GoogleProviderConfig) {
    this.configuration = new Configuration(
      {
        issuer: ISSUER,
        authorization_endpoint: AUTHORIZATION_ENDPOINT,
        token_endpoint: TOKEN_ENDPOINT,
        // Where the ID token's signature is checked against Google's keys.
        jwks_uri: JWKS_URI,
      } satisfies ServerMetadata,
      config.clientId,
      { redirect_uris: [config.redirectUri] },
      ClientSecretPost(config.clientSecret),
    );
  }

  authorizationUrl(state: string, codeChallenge: string): string {
    return buildAuthorizationUrl(this.configuration, {
      redirect_uri: this.config.redirectUri,
      scope: SCOPE,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).href;
  }

  async exchange(code: string, codeVerifier: string): Promise<ProviderProfile> {
    const tokens = await authorizationCodeGrant(
      this.configuration,
      new URL(`${this.config.redirectUri}?code=${encodeURIComponent(code)}`),
      {
        // The controller has already compared the state with the one in the flow cookie.
        expectedState: skipStateCheck,
        // Google always returns an ID token for the `openid` scope; asking for it is what makes the
        // library verify its signature and its claims instead of handing back whatever arrived.
        idTokenExpected: true,
        pkceCodeVerifier: codeVerifier,
      },
    );

    const claims = tokens.claims();
    if (claims === undefined) {
      throw new Error('Google answered the exchange without an id_token');
    }

    const email = typeof claims.email === 'string' ? claims.email : null;

    return {
      providerUserId: claims.sub,
      email,
      // Google reports this as a boolean. Anything else is not a verified address.
      emailVerified: claims.email_verified === true,
      displayName: nameOrLocalPart(claims.name, email),
      avatarUrl: typeof claims.picture === 'string' ? claims.picture : null,
    };
  }
}

/** What to call the player: what Google says, then the part of the address before the `@`, then a word. */
function nameOrLocalPart(name: unknown, email: string | null): string {
  if (typeof name === 'string' && name.trim() !== '') return name.trim();
  const localPart = email?.split('@')[0]?.trim();
  return localPart === undefined || localPart === '' ? 'Player' : localPart;
}
