import { Controller, Get, HttpStatus, Inject, Query, UseGuards } from '@nestjs/common';
import { apiError } from '../app';
import { CurrentUser } from '../auth/current-user';
import type { SessionPayload } from '../auth/session';
import { SessionGuard } from '../auth/session.guard';
import { decodeCursor, MatchesService, type MatchCursor, type MatchHistory } from './matches.service';

/**
 * The battle history: the matches the player who is asking has finished, newest first.
 *
 * There is no route here that names a match, an agent or a player — the history is the caller's own and
 * the only thing that says whose it is is the session. Nothing a client sends can widen that: the cursor
 * is read as a position, and any other query parameter is simply not read at all, which is what makes
 * `?userId=` a no-op rather than something a case has to prove is refused.
 */
@Controller('me/matches')
@UseGuards(SessionGuard)
export class MatchesController {
  constructor(@Inject(MatchesService) private readonly matches: MatchesService) {}

  @Get()
  async history(
    @CurrentUser() session: SessionPayload,
    @Query('cursor') cursor?: string,
  ): Promise<MatchHistory> {
    return this.matches.history(session.userId, readCursor(cursor));
  }
}

/**
 * The page boundary a request asked for, or null for the first page. A marker that is not one of ours is
 * a 400 and named as such: it is the client's own state gone wrong, and answering with the first page
 * instead would make a broken cursor look like a working one for exactly one page.
 */
function readCursor(raw: string | undefined): MatchCursor | null {
  if (raw === undefined || raw === '') return null;

  const cursor = decodeCursor(raw);
  if (cursor === null) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'invalid_cursor',
      'That page marker is not one this platform handed out.',
    );
  }
  return cursor;
}
