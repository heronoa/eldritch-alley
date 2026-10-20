import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { unauthenticated, type AuthenticatedRequest } from './session.guard';
import type { SessionPayload } from './session';

/**
 * The session the guard checked, for a handler that wears `SessionGuard`. The throw is a net and not a
 * second check: a route that reads this without the guard is a route that would otherwise answer with
 * `undefined`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionPayload => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.session === undefined) throw unauthenticated();

    return request.session;
  },
);
