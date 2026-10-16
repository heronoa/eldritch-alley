import type { OAuthProvider, ProviderName, ProviderProfile } from './provider';

/**
 * A provider with no network behind it: it answers with the profile the caller hands it, and it can be
 * told to refuse. This is what the route tests sign in with, and what a developer can point the local
 * platform at to walk the flow without a GitHub or Google application.
 */
export class FakeProvider implements OAuthProvider {
  constructor(
    readonly name: ProviderName,
    private readonly respond: () => ProviderProfile,
  ) {}

  authorizationUrl(state: string, codeChallenge: string): string {
    const url = new URL(`https://${this.name}.test/authorize`);
    url.searchParams.set('client_id', 'fake');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /** Throws whatever `respond` throws, which is how a case gets a provider that refuses the exchange. */
  async exchange(): Promise<ProviderProfile> {
    return this.respond();
  }
}
