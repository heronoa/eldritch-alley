import { createHash, randomBytes } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import { AuthToken, type AuthTokenPurpose } from '../db/entities/auth-token.entity';
import type { Identity } from '../db/entities/identity.entity';

export { AuthToken };
export type { AuthTokenPurpose };

/**
 * How long each link is worth. A day for a verification, because a mailbox may be checked once a day and
 * the account is unusable until it is followed; an hour for a reset, because a reset is followed within
 * minutes or it is not being followed at all, and a mailbox read a year from now must not be a way in.
 */
export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;

const TOKEN_BYTES = 32;

/**
 * What the database holds for a token. The value that was mailed is never written anywhere: a bearer
 * credential for an account is exactly what somebody reads out of a backup, and a hash they read is
 * worth nothing.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mints a link for an identity, and spends whatever was live for the same purpose.
 *
 * Spending the previous one is the point: without it a player who asked twice has two working links in
 * two mailboxes, and no way to take either of them back.
 */
export async function issueAuthToken(
  em: EntityManager,
  identity: Identity,
  purpose: AuthTokenPurpose,
): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  await spendTokens(em, identity, purpose);
  em.create(AuthToken, {
    identity,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlOf(purpose)),
  });
  await em.flush();

  return token;
}

/**
 * The identity behind a token that is being followed, or `null` for one that was never issued, that was
 * already spent, that has expired, or that was minted for something else. The caller has nothing left to
 * check: every way a link can be wrong is one answer, and the route turns it into one refusal.
 */
export async function consumeAuthToken(
  em: EntityManager,
  token: string,
  purpose: AuthTokenPurpose,
): Promise<Identity | null> {
  // The state is read and then judged here rather than filtered in the query, so that a spent row is
  // still found: "already used" and "never existed" are the same answer to the player, and the code that
  // has to tell them apart is code nobody needs.
  //
  // `refresh`, because a row this unit of work has already read may have been spent or have expired since
  // — by another request, in another process — and a link is judged on what the database says now.
  const row = await em.findOne(
    AuthToken,
    { tokenHash: hashToken(token), purpose },
    { populate: ['identity'], refresh: true },
  );
  if (row === null || row.consumedAt !== null) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  row.consumedAt = new Date();
  await em.flush();

  return row.identity;
}

/**
 * Ends every live link for an identity. With a purpose, the links of that purpose — which is what issuing
 * a new one does to the old. Without one, every link there is: choosing a new password ends the links
 * that were minted under the old one, verification links included (ADR 0021).
 */
export async function spendTokens(
  em: EntityManager,
  identity: Identity,
  purpose?: AuthTokenPurpose,
): Promise<void> {
  const live = await em.find(AuthToken, {
    identity,
    consumedAt: null,
    ...(purpose === undefined ? {} : { purpose }),
  });

  const now = new Date();
  for (const row of live) row.consumedAt = now;
}

function ttlOf(purpose: AuthTokenPurpose): number {
  return purpose === 'verify_email' ? VERIFY_EMAIL_TTL_MS : RESET_PASSWORD_TTL_MS;
}
