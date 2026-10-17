import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KEYCLOAK_ISSUER, OAUTH_VARIABLES } from './test-app';
import { oauthProvidersFromEnvironment } from './provider';

// A credential for a third party is the one configuration this platform cannot invent, so it is the one
// configuration whose absence switches a feature off instead of stopping the service (§ 8). The
// environment is read directly by the factory, so these cases own `process.env` for their duration and
// put back exactly what they found.
type Variable = (typeof OAUTH_VARIABLES)[number];

const REDIRECT_BASE_URL = 'https://api.eldritch.test';

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const name of OAUTH_VARIABLES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of OAUTH_VARIABLES) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** The variables a case wants; everything left out is left unset, including what an earlier call set. */
function configure(values: Partial<Record<Variable, string>>): void {
  for (const name of OAUTH_VARIABLES) delete process.env[name];
  for (const [name, value] of Object.entries(values)) {
    process.env[name] = value;
  }
}

/** Both halves of one provider's credential. */
function pair(provider: 'GITHUB' | 'GOOGLE'): Partial<Record<Variable, string>> {
  return {
    [`OAUTH_${provider}_CLIENT_ID`]: `${provider.toLowerCase()}-client-id`,
    [`OAUTH_${provider}_CLIENT_SECRET`]: `${provider.toLowerCase()}-client-secret`,
  } as Partial<Record<Variable, string>>;
}

/** The realm's three values, which are one set rather than a pair. */
function realm(overrides: Partial<Record<Variable, string>> = {}): Partial<Record<Variable, string>> {
  return {
    OAUTH_KEYCLOAK_CLIENT_ID: 'keycloak-client-id',
    OAUTH_KEYCLOAK_CLIENT_SECRET: 'keycloak-client-secret',
    OAUTH_KEYCLOAK_ISSUER: KEYCLOAK_ISSUER,
    ...overrides,
  };
}

describe('oauthProvidersFromEnvironment', () => {
  it('builds nothing, and does not throw, when the environment has no OAuth value at all', () => {
    expect(oauthProvidersFromEnvironment()).toEqual({});
  });

  it('treats a blank value as one that is not set, because that is what a compose file passes', () => {
    // `docker compose` hands `${VAR:-}` over as an empty string, and a half-filled `.env` holds the
    // same. Neither is a credential, and a pair of them is a provider that is simply off.
    configure({
      OAUTH_REDIRECT_BASE_URL: '',
      OAUTH_GITHUB_CLIENT_ID: '',
      OAUTH_GITHUB_CLIENT_SECRET: '',
      OAUTH_GOOGLE_CLIENT_ID: '   ',
      OAUTH_GOOGLE_CLIENT_SECRET: '   ',
    });

    expect(oauthProvidersFromEnvironment()).toEqual({});
  });

  it('builds only the provider whose two values are both there', () => {
    configure({ OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL, ...pair('GITHUB') });
    expect(Object.keys(oauthProvidersFromEnvironment())).toEqual(['github']);

    configure({ OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL, ...pair('GOOGLE') });
    expect(Object.keys(oauthProvidersFromEnvironment())).toEqual(['google']);
  });

  it('builds both when both pairs are there', () => {
    configure({
      OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL,
      ...pair('GITHUB'),
      ...pair('GOOGLE'),
    });
    expect(Object.keys(oauthProvidersFromEnvironment())).toEqual(['github', 'google']);
  });

  it('refuses to build a provider with an id and no secret, naming both variables', () => {
    configure({ OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL, OAUTH_GITHUB_CLIENT_ID: 'github-client-id' });

    // Half a credential is a typo and never a choice, and it fails where the mistake was made rather
    // than at the first sign-in, where it would read as the provider's own fault.
    expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_GITHUB_CLIENT_ID/);
    expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_GITHUB_CLIENT_SECRET/);
  });

  it('refuses to build a provider with a secret and no id, naming both variables', () => {
    configure({
      OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL,
      OAUTH_GOOGLE_CLIENT_SECRET: 'google-client-secret',
    });

    expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_GOOGLE_CLIENT_ID/);
    expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_GOOGLE_CLIENT_SECRET/);
  });

  it('sends the browser back to the callback of the provider it was configured for', () => {
    configure({ OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL, ...pair('GITHUB') });

    const github = oauthProvidersFromEnvironment().github;
    const url = new URL(github?.authorizationUrl('a-state', 'a-challenge') ?? '');
    expect(url.searchParams.get('redirect_uri')).toBe(`${REDIRECT_BASE_URL}/auth/github/callback`);
  });

  it('refuses to build a configured provider with no redirect base to send the browser back to', () => {
    configure(pair('GITHUB'));

    // The base is what the two callbacks are built from, so it is required exactly when there is a
    // provider to build one for — and it is the same typo as the half pair above.
    expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_REDIRECT_BASE_URL/);
  });

  it('does not ask for a redirect base when there is no provider to build a callback for', () => {
    expect(() => oauthProvidersFromEnvironment()).not.toThrow();
  });

  describe('Keycloak beside the direct providers', () => {
    it('builds all three when the realm and both direct pairs are configured', () => {
      configure({
        OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL,
        ...pair('GITHUB'),
        ...pair('GOOGLE'),
        ...realm(),
      });

      // Each button follows its own credentials: a realm in front of the deployment adds a way in and
      // hides nothing that was already there.
      expect(Object.keys(oauthProvidersFromEnvironment())).toEqual(['keycloak', 'github', 'google']);
    });

    it('builds Keycloak when only the realm is configured', () => {
      configure({ OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL, ...realm() });
      expect(Object.keys(oauthProvidersFromEnvironment())).toEqual(['keycloak']);
    });

    it('builds the direct providers the environment configures beside the realm', () => {
      configure({ OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL, ...pair('GITHUB'), ...realm() });

      expect(Object.keys(oauthProvidersFromEnvironment())).toEqual(['keycloak', 'github']);
    });

    it('still refuses a half-configured direct provider beside the realm', () => {
      // The direct pairs are read whether or not a realm exists, so a typo in one of them stops the
      // boot instead of quietly dropping a button the deployment meant to offer.
      configure({
        OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL,
        OAUTH_GITHUB_CLIENT_ID: 'github-client-id',
        ...realm(),
      });

      expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_GITHUB_CLIENT_SECRET/);
    });

    it('refuses half a realm, naming every variable that is missing', () => {
      configure({ OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL, OAUTH_KEYCLOAK_CLIENT_ID: 'keycloak-client-id' });

      expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_KEYCLOAK_CLIENT_SECRET/);
      expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_KEYCLOAK_ISSUER/);
    });

    it('refuses a realm with an id and a secret but no issuer', () => {
      configure({
        OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL,
        OAUTH_KEYCLOAK_CLIENT_ID: 'keycloak-client-id',
        OAUTH_KEYCLOAK_CLIENT_SECRET: 'keycloak-client-secret',
      });

      expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_KEYCLOAK_ISSUER/);
    });

    it('sends the browser to the realm with the API callback and the three scopes', () => {
      configure({ OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL, ...realm() });

      const keycloak = oauthProvidersFromEnvironment().keycloak;
      const url = new URL(keycloak?.authorizationUrl('a-state', 'a-challenge') ?? '');

      expect(`${url.origin}${url.pathname}`).toBe(`${KEYCLOAK_ISSUER}/protocol/openid-connect/auth`);
      expect(url.searchParams.get('redirect_uri')).toBe(`${REDIRECT_BASE_URL}/auth/keycloak/callback`);
      expect(url.searchParams.get('scope')).toBe('openid profile email');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('refuses a configured realm with no redirect base to send the browser back to', () => {
      configure(realm());
      expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_REDIRECT_BASE_URL/);
    });

    it('refuses an issuer that is not an http(s) URL', () => {
      configure({
        OAUTH_REDIRECT_BASE_URL: REDIRECT_BASE_URL,
        ...realm({ OAUTH_KEYCLOAK_ISSUER: 'sso.example/realms/homelab' }),
      });

      expect(() => oauthProvidersFromEnvironment()).toThrow(/OAUTH_KEYCLOAK_ISSUER/);
    });
  });
});
