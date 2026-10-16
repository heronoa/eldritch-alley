import {
  ClientSecretPost,
  Configuration,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  skipStateCheck,
} from 'openid-client';
import type { OAuthProvider, ProviderProfile } from './provider';

const ISSUER = 'https://github.com';
const AUTHORIZATION_ENDPOINT = 'https://github.com/login/oauth/authorize';
const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';

/** `user:email` is what makes the verified-address endpoint answer at all. */
const SCOPE = 'read:user user:email';

/** `ServerMetadata` is not exported by `openid-client`; this is the type its own constructor takes. */
type ServerMetadata = ConstructorParameters<typeof Configuration>[0];

export interface GithubProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface GithubAddress {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * GitHub, which speaks OAuth 2.0 and not OpenID Connect: there is no discovery document to fetch and no
 * ID token to verify, so the profile comes from the REST API and the address from the endpoint that
 * says whether GitHub verified it.
 */
export class GithubProvider implements OAuthProvider {
  readonly name = 'github' as const;

  private readonly configuration: Configuration;

  constructor(private readonly config: GithubProviderConfig) {
    // The endpoints are written here rather than discovered: discovery is a network call while the
    // container is being built, and a platform that will not start because GitHub is unreachable is a
    // worse platform. GitHub's endpoints have not moved in a decade.
    this.configuration = new Configuration(
      {
        issuer: ISSUER,
        authorization_endpoint: AUTHORIZATION_ENDPOINT,
        token_endpoint: TOKEN_ENDPOINT,
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
      this.callbackUrl(code),
      {
        // The controller has already compared the state with the one in the flow cookie, which is the
        // only copy that means anything here: the URL this method is handed is one it built itself.
        expectedState: skipStateCheck,
        idTokenExpected: false,
        pkceCodeVerifier: codeVerifier,
      },
    );

    const [user, address] = await Promise.all([
      this.api<GithubUser>('/user', tokens.access_token),
      this.verifiedAddress(tokens.access_token),
    ]);

    return {
      providerUserId: String(user.id),
      // GitHub hides the address of an account that keeps it private, and that is a real answer: the
      // profile then has no address and sign-in takes the new-account path.
      email: address?.email ?? user.email,
      // An address read from `/user` and not from `/user/emails` is not carried as verified: GitHub
      // vouches for it nowhere the platform can see, and a link is only ever made on a verified one.
      emailVerified: address?.verified ?? false,
      displayName: user.name ?? user.login,
      avatarUrl: user.avatar_url,
    };
  }

  /**
   * The redirect URI without its parameters is what the token endpoint is told, and `openid-client`
   * takes it from the URL it is given — so the callback is rebuilt from the code it carries.
   */
  private callbackUrl(code: string): URL {
    return new URL(`${this.config.redirectUri}?code=${encodeURIComponent(code)}`);
  }

  private async verifiedAddress(accessToken: string): Promise<GithubAddress | null> {
    let addresses: GithubAddress[];
    try {
      addresses = await this.api<GithubAddress[]>('/user/emails', accessToken);
    } catch {
      // This endpoint needs the `user:email` scope. Without it GitHub answers 404, and a sign-in is not
      // worth failing over a scope the player declined — the profile simply has no verified address.
      return null;
    }
    return addresses.find((one) => one.primary) ?? addresses.find((one) => one.verified) ?? null;
  }

  private async api<T>(path: string, accessToken: string): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        // GitHub rejects an API request without one.
        'user-agent': 'eldritch-alley-platform-api',
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub answered ${response.status} for ${path}`);
    }
    return (await response.json()) as T;
  }
}
