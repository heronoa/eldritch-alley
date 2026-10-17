import { readOptional } from '../config';

/**
 * Cloudflare's challenge, behind a port. The service asks one question — is this token good for this
 * address? — and a refusal and an unreachable verifier both answer the same way: the message is not
 * accepted (D2: fail closed, not open).
 */
export interface TurnstileVerifier {
  verify(token: string, ip: string): Promise<boolean>;
}

/** The token the verifier is injected by. */
export const TURNSTILE_VERIFIER = 'TURNSTILE_VERIFIER';

/** The site that checks a token Cloudflare issued. */
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The adapter that reaches Cloudflare. A non-2xx answer, a body without `success: true`, or a network
 *  failure is a refusal; nothing is thrown at the route. */
export class CloudflareTurnstile implements TurnstileVerifier {
  constructor(
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async verify(token: string, ip: string): Promise<boolean> {
    try {
      const response = await this.fetchImpl(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        body: new URLSearchParams({ secret: this.secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return false;

      const body = (await response.json()) as { success?: unknown };
      return body.success === true;
    } catch {
      return false;
    }
  }
}

/**
 * The verifier the tests and the local flow use. It accepts by the rule the case gives it, and a
 * case that wants the network to be down sets `unreachable` and watches the route fail closed.
 */
export class FakeTurnstile implements TurnstileVerifier {
  unreachable = false;

  constructor(private readonly accepts: (token: string) => boolean = () => true) {}

  async verify(token: string): Promise<boolean> {
    if (this.unreachable) throw new Error('the verifier could not be reached');
    return this.accepts(token);
  }
}

/** With no secret the platform has no Cloudflare account, and the fake stands in — dev and tests. */
export function turnstileFromEnvironment(): TurnstileVerifier {
  const secret = readOptional(process.env.TURNSTILE_SECRET);
  return secret === undefined ? new FakeTurnstile() : new CloudflareTurnstile(secret);
}
