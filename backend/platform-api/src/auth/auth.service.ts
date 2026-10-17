import type { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { ENTITY_MANAGER } from '../db/database.module';
import { Agent, type AgentClass } from '../db/entities/agent.entity';
import { Identity, type ProviderName } from '../db/entities/identity.entity';
import { User } from '../db/entities/user.entity';
import type { ProviderProfile } from './provider';

/** What every new player starts with: one of each class, level 1, able to fight. */
export const STARTER_SQUAD: readonly AgentClass[] = ['sniper', 'wizard', 'priest'];

export interface SignInResult {
  user: User;
  /** Whether this sign-in is what created the account. The caller does not need it; a test does. */
  created: boolean;
}

/**
 * Who a sign-in belongs to. There are no passwords here: the account is created by the first sign-in and
 * found again by the pair the provider uses for the player.
 *
 * The rule, and the reason it is written this way: the `(provider, provider_user_id)` pair is the only
 * key that ever decides. An address only ever *adds* a way in, and only when both sides reported it as
 * verified — which is what keeps one person from claiming another's account by getting a provider to
 * report their address (spec, Identities; ADR 0018).
 */
@Injectable()
export class AuthService {
  constructor(@Inject(ENTITY_MANAGER) private readonly em: EntityManager) {}

  async signIn(provider: ProviderName, profile: ProviderProfile): Promise<SignInResult> {
    // A unit of work of its own per sign-in: the fork the module hands out is shared by every request,
    // and an identity map that outlives a request is a map that answers with somebody else's row.
    const em = this.em.fork();
    const email = normalizeAddress(profile.email);

    const known = await em.findOne(
      Identity,
      { provider, providerUserId: profile.providerUserId },
      { populate: ['user'] },
    );
    if (known !== null) {
      return { user: await this.recordSignIn(em, known, profile, email), created: false };
    }

    // Nothing so far knows this pair. The address can still add a way in — but only a verified one on
    // both sides, and never one that was reported as unverified on either.
    const linkable =
      email === null || !profile.emailVerified
        ? null
        : await em.findOne(
            Identity,
            { email, emailVerified: true },
            { populate: ['user'], orderBy: { createdAt: 'asc' } },
          );
    if (linkable !== null) {
      return { user: await this.addIdentity(em, linkable.user, provider, profile, email), created: false };
    }

    return em.transactional(async (tx) => {
      // `create` hands each entity to the unit of work as it is made, so the account, its identity and
      // its squad are one flush — and one transaction: a failure here leaves no half-created player for
      // the next callback to find.
      const user = tx.create(User, {
        displayName: profile.displayName,
        email,
        avatarUrl: profile.avatarUrl,
        lastLoginAt: new Date(),
      });
      tx.create(Identity, {
        user,
        provider,
        providerUserId: profile.providerUserId,
        email,
        emailVerified: profile.emailVerified,
      });
      for (const agentClass of STARTER_SQUAD) {
        tx.create(Agent, { user, class: agentClass, level: 1, status: 'active' });
      }

      await tx.flush();
      return { user, created: true } satisfies SignInResult;
    });
  }

  /** A pair seen before: the same account, whatever the provider now says about the player. */
  private async recordSignIn(
    em: EntityManager,
    identity: Identity,
    profile: ProviderProfile,
    email: string | null,
  ): Promise<User> {
    const user = identity.user;

    // An address replaces what is stored only when the provider vouches for it. An identity that was
    // verified is never written back to unverified, and an unverified address never overwrites one that
    // is — a later sign-in can only ever leave the row as strong as it was.
    if (email !== null && profile.emailVerified) {
      identity.email = email;
      identity.emailVerified = true;
      user.email = email;
    }

    touch(user, profile);
    await em.flush();
    return user;
  }

  /** A second provider for an account that already exists: one more way in, and no second squad. */
  private async addIdentity(
    em: EntityManager,
    user: User,
    provider: ProviderName,
    profile: ProviderProfile,
    email: string | null,
  ): Promise<User> {
    em.create(Identity, {
      user,
      provider,
      providerUserId: profile.providerUserId,
      email,
      emailVerified: profile.emailVerified,
    });
    touch(user, profile);

    // One flush, so the new identity and the refreshed user are written together or not at all.
    await em.flush();
    return user;
  }
}

/** What a provider's answer says about a player, written onto the account on every sign-in. */
function touch(user: User, profile: ProviderProfile): void {
  user.displayName = profile.displayName;
  // A provider that reports no picture does not take away the one already there.
  if (profile.avatarUrl !== null) user.avatarUrl = profile.avatarUrl;
  user.lastLoginAt = new Date();
}

/**
 * One spelling per address, so that two spellings of one address compare equal in the database — which
 * is what the linking rule and its index rely on. The whole address is lowercased and not only the part
 * after the `@`: RFC 5321 makes the local part case-sensitive in theory, and no provider this platform
 * signs in with treats it that way in practice.
 *
 * Exported because a password sign-up looks an identity up by the address too (§ 9), and the two lookups
 * have to agree on the spelling or one of them finds nothing.
 */
export function normalizeAddress(email: string | null): string | null {
  const value = email?.trim().toLowerCase() ?? '';
  return value === '' ? null : value;
}
