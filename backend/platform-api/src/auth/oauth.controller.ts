import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Query,
  Req,
  Res,
  type HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { calculatePKCECodeChallenge, randomPKCECodeVerifier, randomState } from 'openid-client';
import { apiError } from '../app';
import { MAILER, type Mailer } from '../email/mailer';
import { linkedAccountMessage } from '../email/messages';
import { AuthService, normalizeAddress } from './auth.service';
import {
  OAUTH_PROVIDERS,
  PROVIDER_NAMES,
  type OAuthProvider,
  type OAuthProviderName,
  type OAuthProviders,
  type ProviderName,
  type ProviderProfile,
} from './provider';
import {
  FLOW_COOKIE_NAME,
  FLOW_MAX_AGE_SECONDS,
  SESSION_CONFIG,
  flowCookie,
  readFlow,
  sessionCookie,
  signFlow,
  signSession,
  type SessionConfig,
} from './session';

/**
 * Starting and finishing a sign-in. This controller owns the flow's two secrets — the `state` and the
 * PKCE verifier — which travel to the provider in the URL and back in a cookie, and it never sees a
 * password: the provider is the one that asks for those.
 */
@Controller('auth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  /**
   * The states this process has already spent, and when each stops mattering. A cookie cannot be taken
   * back from a browser, so "this state was already used" has to be remembered here. It lives in memory
   * because a flow lasts minutes and the platform is one process; running several would need a shared
   * store, and the state cookie would then be spent in Redis (ADR 0018).
   */
  private readonly spent = new Map<string, number>();

  constructor(
    @Inject(OAUTH_PROVIDERS) private readonly providers: OAuthProviders,
    @Inject(SESSION_CONFIG) private readonly config: SessionConfig,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /**
   * Which providers this deployment has, so that the client can draw one button per name and none at all
   * when the list is empty (§ 8). The client answers this question of the server because it is published
   * as static assets and cannot read the server's environment.
   *
   * Declared before `@Get(':provider')` because Nest matches routes in the order they are declared, and
   * declared after it `providers` would be read as a provider called `providers` — which answers 404, and
   * looks exactly like an endpoint that was never written.
   */
  @Get('providers')
  providerList(): { providers: OAuthProviderName[] } {
    return { providers: PROVIDER_NAMES.filter((name) => this.providers[name] !== undefined) };
  }

  @Get(':provider')
  async start(@Param('provider') name: string, @Res() response: Response): Promise<void> {
    const provider = this.provider(name);

    const state = randomState();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    // The verifier travels in the cookie and never in the URL: a verifier in the address bar is a
    // verifier in the browser's history, in the referrer and in every log on the way.
    const flow = await signFlow({ provider: provider.name, state, codeVerifier }, this.config);

    response.setHeader('Set-Cookie', flowCookie(flow, this.config));
    response.redirect(HttpStatus.FOUND, provider.authorizationUrl(state, codeChallenge));
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') name: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const provider = this.provider(name);

    const flow = await readFlow(request.cookies?.[FLOW_COOKIE_NAME] ?? '', this.config);
    if (flow === null || flow.provider !== provider.name || state === undefined || flow.state !== state) {
      throw invalidState('This sign-in did not start here, or it took too long.');
    }
    if (code === undefined || code === '') {
      throw apiError(HttpStatus.BAD_REQUEST, 'missing_code', 'The provider sent the browser back without a code.');
    }
    if (this.spent.has(state)) {
      throw invalidState('This sign-in was already finished.');
    }
    this.spend(state);

    const profile = await this.exchange(provider, code, flow.codeVerifier);
    const { user, linked } = await this.auth.signIn(provider.name, profile);

    // A link is a new way into an account that already existed. The person who owns the address is the
    // one who can tell whether it was them, so the notice goes there and nowhere else.
    if (linked) await this.notifyLinkedAccount(profile, provider.name);

    const session = await signSession(
      // A fresh session id per sign-in: nothing is stored against it yet, and it is the name a
      // server-side revocation would carry when account deletion arrives (out of scope for m4-02).
      { userId: user.id, sessionId: randomUUID(), issuedAt: Date.now() },
      this.config,
    );

    response.setHeader('Set-Cookie', sessionCookie(session, this.config));
    response.redirect(HttpStatus.FOUND, this.config.clientOrigin);
  }

  /**
   * The exchange, with the provider's own reason kept out of the answer. What a provider says when it
   * refuses can name the client, the secret and the account, and none of that belongs in a body the
   * browser can read: it goes to the log, and the client gets one sentence.
   */
  private async exchange(
    provider: OAuthProvider,
    code: string,
    codeVerifier: string,
  ): Promise<ProviderProfile> {
    try {
      return await provider.exchange(code, codeVerifier);
    } catch (error) {
      this.logger.error(`${provider.name} refused the exchange`, error as Error);
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        'provider_refused',
        'The provider refused this sign-in. Try again.',
      );
    }
  }

  /**
   * The notice that a new way in was added, sent to the address the provider just vouched for — the
   * linking rule only fires when both sides verified it, so there is always an address here.
   *
   * A mail that fails to send is logged and swallowed: the player is already signed in, and a courtesy
   * message is not worth turning a successful sign-in into an error. The address is kept out of the log
   * line, which is read on machines the address was never meant for.
   */
  private async notifyLinkedAccount(
    profile: ProviderProfile,
    provider: OAuthProviderName,
  ): Promise<void> {
    const to = normalizeAddress(profile.email);
    if (to === null) return;

    try {
      await this.mailer.send(linkedAccountMessage(to, provider));
    } catch (error) {
      this.logger.error('could not send the linked-account notice', error as Error);
    }
  }

  private provider(name: string): OAuthProvider {
    // `hasOwn` and not a plain lookup: `this.providers['constructor']` is a function, and a route that
    // answers 500 for `/auth/constructor` is a route that answers 500.
    const provider = Object.hasOwn(this.providers, name)
      ? this.providers[name as OAuthProviderName]
      : undefined;
    if (provider === undefined) {
      throw apiError(HttpStatus.NOT_FOUND, 'unknown_provider', `There is no provider called ${name}.`);
    }
    return provider;
  }

  /** Keeps the map from growing without bound: a state stops mattering once no flow cookie can carry it. */
  private spend(state: string): void {
    const now = Date.now();
    for (const [spent, expiresAt] of this.spent) {
      if (expiresAt <= now) this.spent.delete(spent);
    }
    this.spent.set(state, now + FLOW_MAX_AGE_SECONDS * 1000);
  }
}

/**
 * The three ways a flow can be wrong — the cookie is gone, the state does not match it, the state was
 * already spent — are one refusal to a player, and they share the code `invalid_state` deliberately:
 * telling them apart would tell an attacker which half of the flow they got right. They are written
 * through one function so that the three cannot drift onto three codes later.
 */
function invalidState(message: string): HttpException {
  return apiError(HttpStatus.BAD_REQUEST, 'invalid_state', message);
}
