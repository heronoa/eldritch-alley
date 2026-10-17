import type { EntityManager } from '@mikro-orm/postgresql';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user';
import { unauthenticated, SessionGuard } from '../auth/session.guard';
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
}

/** What the profile panel draws: who the player is, and the squad they take into a match. */
@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(@Inject(ENTITY_MANAGER) private readonly em: EntityManager) {}

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
    };
  }
}
