import type { EntityManager } from '@mikro-orm/postgresql';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { apiError } from '../app';
import { AccountDeletionService } from '../auth/account-deletion.service';
import { CurrentUser } from '../auth/current-user';
import { unauthenticated, UserSessionGuard } from '../auth/session.guard';
import type { SessionPayload } from '../auth/session';
import { ENTITY_MANAGER } from '../db/database.module';
import { Agent, type AgentClass, type AgentStatus } from '../db/entities/agent.entity';
import { ReleaseSubscription } from '../db/entities/release-subscription.entity';
import { User } from '../db/entities/user.entity';
import { resolveEmailLocale } from '../email/locale';
import { PRIVACY_VERSION } from '../privacy';
import { ReleaseService, type ReleaseEmails } from '../release/release.service';

export interface MeResponse {
  user: {
    id: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
  };
  agents: { id: string; class: AgentClass; level: number; status: AgentStatus }[];
  /**
   * Whether the account can be entered with a password. The client's one question before it shows the
   * password field in the deletion dialog — an SSO-only account owes the confirmation alone.
   */
  hasPassword: boolean;
  /** The release-e-mail consent, off with no date until the player decides (D6). */
  releaseEmails: ReleaseEmails;
}

/** The consent as the profile reads it: the date is an ISO string, `null` when it never happened. */
function releaseEmailsOf(subscription: ReleaseSubscription | null): ReleaseEmails {
  return {
    optedIn: subscription?.optedIn ?? false,
    consentedAt: subscription?.consentedAt?.toISOString() ?? null,
  };
}

/** What the profile panel draws: who the player is, and the squad they take into a match. */
@Controller('me')
@UseGuards(UserSessionGuard)
export class MeController {
  constructor(
    @Inject(ENTITY_MANAGER) private readonly em: EntityManager,
    @Inject(AccountDeletionService) private readonly deletions: AccountDeletionService,
    @Inject(ReleaseService) private readonly releases: ReleaseService,
  ) {}

  @Get()
  async me(@CurrentUser() session: SessionPayload): Promise<MeResponse> {
    const em = this.em.fork();

    const user = await em.findOne(User, { id: session.userId });
    // A cookie that verifies for an account that is gone is worth exactly as much as no cookie: the
    // client signs in again either way.
    if (user === null) throw unauthenticated();

    // `GET /me` is the sign-in's last step, and it is where the policy the player was shown is
    // recorded (D7): no banner, no gate, one column.
    if (user.privacyVersionSeen !== PRIVACY_VERSION) {
      user.privacyVersionSeen = PRIVACY_VERSION;
      await em.flush();
    }

    const agents = await em.find(Agent, { user: user.id }, { orderBy: { class: 'asc' } });
    const releaseEmails = releaseEmailsOf(await this.releases.state(user.id));

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      agents: agents.map((agent) => ({
        id: agent.id,
        class: agent.class,
        level: agent.level,
        status: agent.status,
      })),
      hasPassword: await this.deletions.hasPassword(user.id),
      releaseEmails,
    };
  }

  @Patch('release-emails')
  async setReleaseEmails(
    @CurrentUser() session: SessionPayload,
    @Body() body: unknown,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<ReleaseEmails> {
    const optedIn = isRecord(body) ? body['optedIn'] : undefined;
    if (typeof optedIn !== 'boolean') {
      throw apiError(HttpStatus.BAD_REQUEST, 'invalid_body', 'optedIn must be a boolean.');
    }

    const subscription = await this.releases.set(
      session.userId,
      optedIn,
      resolveEmailLocale(acceptLanguage),
    );
    return releaseEmailsOf(subscription);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
