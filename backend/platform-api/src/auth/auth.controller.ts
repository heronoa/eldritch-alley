import { Controller, HttpCode, HttpStatus, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from './current-user';
import { GAME_TICKET_CONFIG, issueGameTicket, type GameTicketConfig } from './game-ticket';
import { SESSION_CONFIG, clearSessionCookie, type SessionConfig, type SessionPayload } from './session';
import { SessionGuard } from './session.guard';

/** What a signed-in player can ask of their own session. */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(SESSION_CONFIG) private readonly config: SessionConfig,
    @Inject(GAME_TICKET_CONFIG) private readonly tickets: GameTicketConfig,
  ) {}

  /**
   * Clearing the cookie is all a logout does. The session is stateless by decision D3, so nothing on the
   * server side is revoked and a copy of the cookie taken before the logout stays valid until it ages
   * out — which is why the cookie is `HttpOnly` and the account deletion endpoint, when it arrives,
   * brings the revocation with it (ADR 0018).
   */
  @Post('logout')
  @UseGuards(SessionGuard)
  logout(@Res() response: Response): void {
    response.setHeader('Set-Cookie', clearSessionCookie(this.config));
    response.status(HttpStatus.NO_CONTENT).end();
  }

  /**
   * The ticket the match server verifies. It is issued to a signed-in player only, travels through the
   * client, and is worth minutes (ADR 0018).
   */
  @Post('game-ticket')
  @UseGuards(SessionGuard)
  // Nothing is created here: the ticket is a signed answer, not a resource, so it is a 200 and not the
  // 201 Nest gives a POST by default.
  @HttpCode(HttpStatus.OK)
  async gameTicket(@CurrentUser() session: SessionPayload): Promise<{ ticket: string; expiresAt: Date }> {
    return issueGameTicket(session.userId, this.tickets);
  }
}
