import type { EntityManager } from '@mikro-orm/postgresql';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AccountDeletionService } from '../auth/account-deletion.service';
import { CurrentUser } from '../auth/current-user';
import { unauthenticated, UserSessionGuard } from '../auth/session.guard';
import type { SessionPayload } from '../auth/session';
import { ENTITY_MANAGER } from '../db/database.module';
import { Agent, type AgentClass, type AgentStatus } from '../db/entities/agent.entity';
import { User } from '../db/entities/user.entity';

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
}

/** What the profile panel draws: who the player is, and the squad they take into a match. */
@Controller('me')
@UseGuards(UserSessionGuard)
export class MeController {
  constructor(
    @Inject(ENTITY_MANAGER) private readonly em: EntityManager,
    @Inject(AccountDeletionService) private readonly deletions: AccountDeletionService,
  ) {}

  @Get()
  async me(@CurrentUser() session: SessionPayload): Promise<MeResponse> {
    const em = this.em.fork();

    const user = await em.findOne(User, { id: session.userId });
    // A cookie that verifies for an account that is gone is worth exactly as much as no cookie: the
    // client signs in again either way.
    if (user === null) throw unauthenticated();

    const agents = await em.find(Agent, { user: user.id }, { orderBy: { class: 'asc' } });

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
    };
  }
}
