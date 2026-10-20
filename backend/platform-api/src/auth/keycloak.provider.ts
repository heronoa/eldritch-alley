import {
  ClientSecretPost,
  Configuration,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  skipStateCheck,
} from 'openid-client';
import type { OAuthProvider, ProviderProfile } from './provider';

/** Keycloak's standard scopes: the ID token carries the address, the name and the picture. */
const SCOPE = 'openid profile email';

/** `ServerMetadata` is not exported by `openid-client`; this is the type its own constructor takes. */
type ServerMetadata = ConstructorParameters<typeof Configuration>[0];

export interface KeycloakProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** The realm's URL, e.g. `https://sso.example/realms/homelab`. It is also the ID token's issuer. */
  issuer: string;
}

/**
 * Keycloak, as the one provider a deployment exposes when it has a realm. The realm brokers the
 * upstream providers, so the platform links to Keycloak only: it never learns whether the player came
 * through Google, through GitHub or through the realm's own form.
 *
 * The endpoints are composed from the realm URL rather than discovered, for the reason ADR 0018 gives
 * for GitHub and Google: discovery is a network call while the container is being built, and a platform
 * that will not start because the SSO server is unreachable is a worse platform. Keycloak's paths have
 * been the same for years.
 */
export class KeycloakProvider implements OAuthProvider {
  readonly name = 'keycloak' as const;

  private readonly configuration: Configuration;

  constructor(private readonly config: KeycloakProviderConfig) {
    const issuer = realmUrl(config.issuer);
    this.configuration = new Configuration(
      {
        issuer,
        authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
        token_endpoint: `${issuer}/protocol/openid-connect/token`,
        // Where the ID token's signature is checked against the realm's keys.
        jwks_uri: `${issuer}/protocol/openid-connect/certs`,
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
        // Keycloak returns an ID token for `openid`; asking for it makes the library verify its
        // signature and its issuer, audience and expiry before any claim is read.
        idTokenExpected: true,
        pkceCodeVerifier: codeVerifier,
      },
    );

    const claims = tokens.claims();
    if (claims === undefined) {
      throw new Error('Keycloak answered the exchange without an id_token');
    }
    return profileFromClaims(claims);
  }
}

/**
 * The realm's address, without a trailing slash so that the endpoints below are composed once. A value
 * that is not an http(s) URL stops the container while it is built, naming the variable: a typo in the
 * issuer is the same class of mistake as half a credential.
 */
function realmUrl(issuer: string): string {
  let url: URL;
  try {
    url = new URL(issuer.trim());
  } catch {
    throw new Error(`OAUTH_KEYCLOAK_ISSUER must be an http:// or https:// URL, got "${issuer}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`OAUTH_KEYCLOAK_ISSUER must be an http:// or https:// URL, got "${issuer}"`);
  }
  return url.href.replace(/\/+$/, '');
}

/**
 * The ID token's claims as the platform understands a player — a pure function, so a test can read it
 * without a realm. `email_verified` has to be the boolean `true`: Keycloak may relay a string when a
 * brokered provider sends one, and a string is not a verification this platform can act on.
 */
export function profileFromClaims(claims: Record<string, unknown>): ProviderProfile {
  const subject = claims.sub;
  if (typeof subject !== 'string' || subject.trim() === '') {
    throw new Error('Keycloak answered the exchange without a sub claim');
  }

  const email = typeof claims.email === 'string' && claims.email.trim() !== '' ? claims.email.trim() : null;

  return {
    providerUserId: subject,
    email,
    emailVerified: claims.email_verified === true,
    displayName: nameOf(claims.name, claims.preferred_username, email),
    avatarUrl: typeof claims.picture === 'string' ? claims.picture : null,
  };
}

/**
 * What to call the player: the full name, then the realm's username, then the part of the address
 * before the `@`, then a word. Keycloak always sends `preferred_username`, so the last two are for a
 * realm configured without it.
 */
function nameOf(name: unknown, preferredUsername: unknown, email: string | null): string {
  if (typeof name === 'string' && name.trim() !== '') return name.trim();
  if (typeof preferredUsername === 'string' && preferredUsername.trim() !== '') {
    return preferredUsername.trim();
  }
  const localPart = email?.split('@')[0]?.trim();
  return localPart === undefined || localPart === '' ? 'Player' : localPart;
}
