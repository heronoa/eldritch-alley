import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolveEmailLocale } from '../email/locale';
import { AccountDeletionService } from './account-deletion.service';
import { clientAddress } from './client-address';
import { CurrentUser } from './current-user';
import { GAME_TICKET_CONFIG, issueGameTicket, type GameTicketConfig } from './game-ticket';
import { SESSION_CONFIG, clearSessionCookie, type SessionConfig, type SessionPayload } from './session';
import { SessionGuard, UserSessionGuard } from './session.guard';

/** What a signed-in player can ask of their own session. */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(SESSION_CONFIG) private readonly config: SessionConfig,
    @Inject(GAME_TICKET_CONFIG) private readonly tickets: GameTicketConfig,
    @Inject(AccountDeletionService) private readonly deletions: AccountDeletionService,
  ) {}

  /**
   * Clearing the cookie is all a logout does. The session is stateless by decision D3, so nothing on the
   * server side is revoked and a copy of the cookie taken before the logout stays valid until it ages
   * out — which is why the cookie is `HttpOnly` and why the deletion route below brings the revocation
   * with it (ADR 0018, ADR 0022). This route keeps the signature-only guard: signing out has to work
   * even when the account behind the cookie is gone.
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
  @UseGuards(UserSessionGuard)
  // Nothing is created here: the ticket is a signed answer, not a resource, so it is a 200 and not the
  // 201 Nest gives a POST by default.
  @HttpCode(HttpStatus.OK)
  async gameTicket(@CurrentUser() session: SessionPayload): Promise<{ ticket: string; expiresAt: Date }> {
    return issueGameTicket(session.userId, this.tickets);
  }

  /**
   * Self-service erasure. The account is deleted, the cookie that asked for it is cleared, and the
   * answer says nothing else: the body is a confirmation the player typed and, when the account has a
   * password, that password. Both are checked before any row is touched (ADR 0022).
   *
   * The guard is the one that checks the account still exists, so a cookie left on another device
   * cannot ask a second time.
   */
  @Delete('account')
  @UseGuards(UserSessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @CurrentUser() session: SessionPayload,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.deletions.delete(
      session.userId,
      body,
      clientAddress(request),
      resolveEmailLocale(request.headers['accept-language']),
    );
    response.setHeader('Set-Cookie', clearSessionCookie(this.config));
  }
}
