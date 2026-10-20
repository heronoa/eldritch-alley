import { describe, expect, it } from 'vitest';
import { KeycloakProvider, profileFromClaims, type KeycloakProviderConfig } from './keycloak.provider';

const ISSUER = 'https://sso.eldritch.test/realms/homelab';
const CONFIG: KeycloakProviderConfig = {
  clientId: 'eldritch-alley',
  clientSecret: 'a-client-secret',
  redirectUri: 'https://api.eldritch.test/auth/keycloak/callback',
  issuer: ISSUER,
};

describe('KeycloakProvider', () => {
  it('builds the authorization URL from the realm, with PKCE and the API callback', () => {
    const url = new URL(new KeycloakProvider(CONFIG).authorizationUrl('a-state', 'a-challenge'));

    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/protocol/openid-connect/auth`);
    expect(url.searchParams.get('client_id')).toBe('eldritch-alley');
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('state')).toBe('a-state');
    expect(url.searchParams.get('code_challenge')).toBe('a-challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('composes the realm path once, whether or not the issuer was configured with a trailing slash', () => {
    const withSlash = new KeycloakProvider({ ...CONFIG, issuer: `${ISSUER}/` });
    const url = new URL(withSlash.authorizationUrl('a-state', 'a-challenge'));

    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/protocol/openid-connect/auth`);
  });

  it('refuses an issuer that is not an http(s) URL, while the container is being built', () => {
    expect(() => new KeycloakProvider({ ...CONFIG, issuer: 'sso.eldritch.test/realms/homelab' })).toThrow(
      /OAUTH_KEYCLOAK_ISSUER/,
    );
  });
});

// The claims a realm answers with, read without a realm. `email_verified` is the one that decides
// whether a sign-in can link to an existing account, so it is the one this suite is hardest on.
describe('profileFromClaims', () => {
  it('maps the realm’s claims to the profile the platform understands', () => {
    expect(
      profileFromClaims({
        sub: 'a-user-id',
        email: 'Player@Example.COM',
        email_verified: true,
        name: 'Heron Amaral',
        preferred_username: 'heron',
        picture: 'https://sso.example/avatar.png',
      }),
    ).toEqual({
      providerUserId: 'a-user-id',
      email: 'Player@Example.COM',
      emailVerified: true,
      displayName: 'Heron Amaral',
      avatarUrl: 'https://sso.example/avatar.png',
    });
  });

  it('refuses a token without a subject, as the other providers do', () => {
    expect(() => profileFromClaims({ email: 'player@example.com' })).toThrow(/sub/);
    expect(() => profileFromClaims({ sub: '   ' })).toThrow(/sub/);
  });

  it('does not count a verification reported as a string', () => {
    // A brokered provider can hand the realm a string. A link is only ever made on a boolean `true`.
    expect(profileFromClaims({ sub: 'a-user-id', email: 'player@example.com', email_verified: 'true' }).emailVerified).toBe(
      false,
    );
    expect(profileFromClaims({ sub: 'a-user-id', email: 'player@example.com' }).emailVerified).toBe(false);
  });

  it('answers no address when the realm reported none or an empty one', () => {
    expect(profileFromClaims({ sub: 'a-user-id' }).email).toBeNull();
    expect(profileFromClaims({ sub: 'a-user-id', email: '   ' }).email).toBeNull();
  });

  it('names the player: the full name, then the username, then the local part, then a word', () => {
    expect(profileFromClaims({ sub: 'a-user-id', name: '  Heron  ' }).displayName).toBe('Heron');
    expect(profileFromClaims({ sub: 'a-user-id', preferred_username: 'heron' }).displayName).toBe('heron');
    expect(profileFromClaims({ sub: 'a-user-id', email: 'local@example.com' }).displayName).toBe('local');
    expect(profileFromClaims({ sub: 'a-user-id' }).displayName).toBe('Player');
  });

  it('answers no avatar when the picture is not a string', () => {
    expect(profileFromClaims({ sub: 'a-user-id', picture: 42 }).avatarUrl).toBeNull();
  });
});
