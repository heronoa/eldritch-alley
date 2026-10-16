import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { apiError } from '../app';
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
