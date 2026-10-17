import type { EntityManager } from '@mikro-orm/postgresql';
import { HttpStatus, Inject, Injectable, Logger, type HttpException } from '@nestjs/common';
import { apiError } from '../app';
import { ENTITY_MANAGER } from '../db/database.module';
import { Identity } from '../db/entities/identity.entity';
import { PasswordCredential } from '../db/entities/password-credential.entity';
import { User } from '../db/entities/user.entity';
import { MAILER, type Mailer } from '../email/mailer';
import type { EmailLocale } from '../email/locale';
import { accountDeletedMessage } from '../email/messages';
import { normalizeAddress } from './auth.service';
import { verifyPassword } from './password';
import { PASSWORD_PROVIDER } from './password.service';
import { unauthenticated } from './session.guard';
import { FAILURE_THROTTLE, type FailureThrottle } from './throttle';

/** What the player has to type, exactly and in capitals, for the request to be an intention. */
const CONFIRMATION = 'DELETE';

/**
 * The erasure of an account, from the confirmation to the last row.
 *
 * Every table that belongs to a player already carries `on delete cascade` to `users` (ADR 0022), so the
 * delete is one `em.remove(user)` and the database does the rest: identities, password credentials,
 * tokens, agents, matches, the agents that fought and every event. There is no soft delete and no grace
 * period — the request asks for erasure, and the schema makes erasure the simple answer.
 *
 * The password proof is asked only of an account that has one: an SSO-only account has nothing to prove
 * beyond the session cookie, and demanding a password there would make deletion impossible for the
 * people who never chose one. The lookup is by `password_credentials` and not by a `password` identity,
 * because an identity that lost its credential row cannot be proved either.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    @Inject(ENTITY_MANAGER) private readonly em: EntityManager,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(FAILURE_THROTTLE) private readonly throttle: FailureThrottle,
  ) {}

  /**
   * Deletes the account and everything that hangs off it. Returns only once the rows are gone; the
   * confirmation mail is a side effect that is attempted afterwards and never changes the answer.
   *
   * The id comes from the session and never from the body, which is the whole of why this cannot be
   * asked to delete somebody else's account.
   */
  async delete(userId: string, body: unknown, ip: string, locale: EmailLocale): Promise<void> {
    const fields = record(body);
    if (fields.confirm !== CONFIRMATION) throw invalidConfirmation();

    const em = this.em.fork();
    const user = await em.findOne(User, { id: userId });
    // The guard already asked, but the account may have been deleted between the two reads — a double
    // click on two devices, or a copy of this request arriving late.
    if (user === null) throw unauthenticated();

    await this.provePassword(em, user, fields.password, ip);

    const address = normalizeAddress(user.email);
    em.remove(user);
    await em.flush();

    // After the delete, to the address captured before it: the row that held the address is gone, and a
    // message that fails must not turn a completed erasure into an error the client would retry.
    if (address !== null) {
      try {
        await this.mailer.send(accountDeletedMessage(address, locale));
      } catch (error) {
        this.logger.error('account deletion: the confirmation could not be sent', error as Error);
      }
    }
  }

  /**
   * Whether the account can be entered with a password. The client's one question before it shows the
   * password field — and the same condition this service uses to decide whether one is required.
   */
  async hasPassword(userId: string): Promise<boolean> {
    const em = this.em.fork();
    return (await this.credentialOf(em, userId)) !== null;
  }

  /**
   * The proof an account with a password owes. Counted in the sign-in throttle, under the account's
   * address (or its id when it has none) and the caller's address, so that the deletion route cannot be
   * used as a cheaper place to guess a password than the sign-in route.
   */
  private async provePassword(
    em: EntityManager,
    user: User,
    password: unknown,
    ip: string,
  ): Promise<void> {
    const credential = await this.credentialOf(em, user.id);
    if (credential === null) return;

    // Missing or empty is not an attempt: it proves nothing, so it is neither counted nor hashed.
    if (typeof password !== 'string' || password === '') throw invalidPassword();

    const address = normalizeAddress(user.email) ?? user.id;
    if (this.throttle.tooMany(address, ip)) throw tooManyAttempts();

    if (!(await verifyPassword(password, credential.passwordHash))) {
      this.throttle.record(address, ip);
      throw invalidPassword();
    }

    this.throttle.clear(address);
  }

  /** The credential behind the account's `password` identity, or nothing when there is no usable one. */
  private async credentialOf(
    em: EntityManager,
    userId: string,
  ): Promise<{ passwordHash: string } | null> {
    const identity = await em.findOne(
      Identity,
      { user: userId, provider: PASSWORD_PROVIDER },
      { fields: ['id'] },
    );
    if (identity === null) return null;

    return em.findOne(PasswordCredential, { identity: identity.id }, { fields: ['passwordHash'] });
  }
}

/** The request body as an object. Anything else has no confirmation in it and is refused as such. */
function record(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * The three refusals of this feature, in the shape every error the platform answers in. The wording of
 * the password refusal names no secret: it is told to the account's own owner, who already knows whether
 * they have a password.
 */
function invalidConfirmation(): HttpException {
  return apiError(
    HttpStatus.BAD_REQUEST,
    'invalid_confirmation',
    `Type ${CONFIRMATION} to confirm that this account, and everything in it, is deleted.`,
  );
}

function invalidPassword(): HttpException {
  return apiError(
    HttpStatus.FORBIDDEN,
    'invalid_password',
    'This account has a password. Send it to delete the account.',
  );
}

function tooManyAttempts(): HttpException {
  return apiError(
    HttpStatus.TOO_MANY_REQUESTS,
    'too_many_attempts',
    'Too many failed attempts for this account. Try again in a few minutes.',
  );
}
