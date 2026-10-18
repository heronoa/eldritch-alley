import type { EntityManager } from '@mikro-orm/postgresql';
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { apiError } from '../app';
import { ENTITY_MANAGER } from '../db/database.module';
import { User } from '../db/entities/user.entity';
import { SESSION_CONFIG, SESSION_COOKIE_NAME, readSession, type SessionConfig } from './session';

/** What a handler reads off the request once this guard has let it through. */
export interface AuthenticatedRequest {
  session?: { userId: string; sessionId: string; issuedAt: number };
}

/**
 * The one error every session route answers with, so the client renders one thing: an expired cookie and
 * a cookie that was never there are the same fact to a player, and neither is worth distinguishing.
 */
export function unauthenticated(): HttpException {
  return apiError(HttpStatus.UNAUTHORIZED, 'unauthenticated', 'Sign in to continue.');
}

/**
 * The guard every route that needs a player wears. It reads the cookie, checks the signature and the
 * age, and hands the payload to the handler through the request — or refuses with the same 401 the rest
 * of the platform answers with.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(SESSION_CONFIG) private readonly config: SessionConfig) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { cookies?: Record<string, string> }>();
    const session = await readSession(request.cookies?.[SESSION_COOKIE_NAME] ?? '', this.config);

    if (session === null) throw unauthenticated();

    request.session = session;
    return true;
  }
}

/**
 * The session guard for the routes whose meaning is "do this to the account the cookie names".
 *
 * A session cookie is a signature over a user id, not a pointer to a row: deleting the account leaves
 * every outstanding cookie valid until it expires, and the account's deletion is exactly the moment its
 * owner would most want the copies on other devices to stop working (ADR 0022). So this guard adds one
 * question to the signature check — does the account still exist? — and answers the same 401 when it
 * does not, which is what the client already knows how to handle.
 *
 * `POST /auth/logout` deliberately keeps the plain guard: signing out is never the operation a missing
 * account has to block, and answering 401 there would leave the cookie in the browser.
 */
@Injectable()
export class UserSessionGuard extends SessionGuard {
  constructor(
    @Inject(SESSION_CONFIG) config: SessionConfig,
    @Inject(ENTITY_MANAGER) private readonly em: EntityManager,
  ) {
    super(config);
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = request.session;
    // The parent either threw or wrote the session, so this is never undefined here.
    const userId = session?.userId ?? '';
    const user = await this.em.fork().findOne(User, { id: userId }, { fields: ['id'] });

    if (user === null) throw unauthenticated();
    return true;
  }
}
