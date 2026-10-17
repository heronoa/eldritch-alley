import { randomBytes } from 'node:crypto';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { HttpStatus, Inject, Injectable, type HttpException } from '@nestjs/common';
import { apiError } from '../app';
import { ENTITY_MANAGER } from '../db/database.module';
import { Identity, type ProviderName } from '../db/entities/identity.entity';
import { PasswordCredential } from '../db/entities/password-credential.entity';
import { User } from '../db/entities/user.entity';
import { MAILER, type Mailer } from '../email/mailer';
import type { EmailLocale } from '../email/locale';
import { resetLink, resetMessage, verificationLink, verificationMessage } from '../email/messages';
import { AuthService, normalizeAddress } from './auth.service';
import { consumeAuthToken, issueAuthToken, spendTokens } from './auth-token';
import { hashPassword, verifyPassword } from './password';
import { SESSION_CONFIG, type SessionConfig } from './session';
import { FAILURE_THROTTLE, type FailureThrottle } from './throttle';

/** The `identities.provider` a password account is written under. Never a button; never a provider. */
export const PASSWORD_PROVIDER: ProviderName = 'password';

export interface Registration {
  email: string;
  password: string;
  /** What the player is called. Absent on a password sign-up unless the form asked, and then the local
   *  part of the address: `users.display_name` has no null and there is no provider to ask. */
  displayName?: string;
}

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Entering with an address and a password: creating the account, proving the address, signing in, and
 * choosing a new password (ADR 0021).
 *
 * Three things hold this together and none of them is obvious in isolation:
 *
 * - The account is created by `AuthService.signIn`, the same call the OAuth callback makes, so a password
 *   sign-up gets the same starter squad in the same transaction and there is one create path in the
 *   platform and not two. The profile it is handed reports `emailVerified: false`, which is what makes
 *   the linking rule refuse to attach this identity to somebody else's account: an address that nobody
 *   has proved adds a way in to nobody.
 * - Nothing here can be used before the address is verified. A password account that could sign in
 *   unverified is the account-takeover case — register with somebody else's address, and the linking
 *   rule does the rest the moment they sign in with Google.
 * - The mail carries a link to the client and the token is spent by a `POST` the player's click causes,
 *   because a link that spends itself on the `GET` is spent by the first machine that reads the mailbox.
 */
@Injectable()
export class PasswordService {
  constructor(
    @Inject(ENTITY_MANAGER) private readonly em: EntityManager,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(SESSION_CONFIG) private readonly config: SessionConfig,
    @Inject(FAILURE_THROTTLE) private readonly throttle: FailureThrottle,
  ) {}

  /**
   * Creates the account behind an address if there is none, and mails a link to it either way.
   *
   * The answer is the same in every case — address free, address taken, address already verified — because
   * the alternative is an endpoint that tells anyone which addresses have accounts here. The language is
   * the caller's, carried on the request: the form knows it, and there is no column to read it from.
   */
  async register(input: Registration, locale: EmailLocale): Promise<void> {
    const address = this.addressFrom(input.email);
    const em = this.em.fork();
    const existing = await this.identityFor(em, address);

    if (existing !== null) {
      // The address is already somebody's account and it is verified. There is nothing to prove, so no
      // link is sent — and the answer the caller gets is the one above, which says nothing.
      if (existing.emailVerified) return;

      // Registered and never verified: nobody has proved this address, so whoever is asking now is as
      // much its owner as whoever asked first, and the password they chose is the one that counts. It is
      // also what makes a registration that failed half way through recoverable by asking again.
      await this.writeCredential(em, existing, input.password);
      await this.mailVerification(em, existing, address, locale);
      return;
    }

    try {
      await this.auth.signIn(PASSWORD_PROVIDER, {
        providerUserId: address,
        email: address,
        emailVerified: false,
        displayName: input.displayName?.trim() || localPartOf(address),
        avatarUrl: null,
      });
    } catch (error) {
      // Two registrations for one address at the same instant. The unique pair the linking rule turns on
      // refused the second insert, which means the first one won and this request continues with it —
      // rather than answering 500 to the second half of a double click.
      if (!(error instanceof UniqueConstraintViolationException)) throw error;
    }

    const identity = await this.identityFor(em, address);
    if (identity === null) throw apiError(HttpStatus.INTERNAL_SERVER_ERROR, 'registration_failed', 'The account could not be created. Try again.');

    await this.writeCredential(em, identity, input.password);
    await this.mailVerification(em, identity, address, locale);
  }

  /** Mails a fresh link for an address that registered and never followed the first one. */
  async resendVerification(email: string, locale: EmailLocale): Promise<void> {
    const address = this.addressFrom(email);
    const em = this.em.fork();
    const identity = await this.identityFor(em, address);

    // Verified already, or never registered: the same answer, and nothing is sent. Whether this address
    // has an account is not a question this route answers.
    if (identity === null || identity.emailVerified) return;

    await this.mailVerification(em, identity, address, locale);
  }

  /**
   * The password behind an address, checked against a stored hash.
   *
   * The same refusal for a wrong password and for an address with no account, and — because the second
   * one is checked against a hash nobody's password matches — the same *cost*: a route that answers in a
   * millisecond for an unknown address is a route that lists the addresses it knows.
   */
  async login(input: Credentials, ip: string): Promise<User> {
    const address = this.addressFrom(input.email);
    if (this.throttle.tooMany(address, ip)) throw tooManyAttempts();

    const em = this.em.fork();
    const identity = await this.identityFor(em, address);
    const credential =
      identity === null ? null : await em.findOne(PasswordCredential, { identity });

    const accepted =
      credential === null
        ? await againstNothing(input.password)
        : await verifyPassword(input.password, credential.passwordHash);

    if (identity === null || credential === null || !accepted) {
      this.throttle.record(address, ip);
      throw invalidCredentials();
    }

    // A correct password for an address nobody has proved is not a sign-in: the account is created and
    // unusable until the link in the mailbox is followed (ADR 0021).
    if (!identity.emailVerified) throw emailNotVerified();

    // Only a sign-in that worked clears the count, and only for the address: an address that stops failing
    // stops being held, and an attacker holding one working account cannot clear their own IP.
    this.throttle.clear(address);

    const user = identity.user;
    user.lastLoginAt = new Date();
    await em.flush();

    return user;
  }

  /** Follows a verification link: the address is proved, and the identity is verified with it. */
  async verify(token: string): Promise<User> {
    const em = this.em.fork();
    const identity = await consumeAuthToken(em, token, 'verify_email');
    if (identity === null) throw invalidToken();

    identity.emailVerified = true;
    if (identity.email !== null) await this.adoptAddress(em, identity);

    await em.flush();
    return em.findOneOrFail(User, { id: identity.user.id });
  }

  /**
   * Mails a link for choosing a new password. The answer is the same whether or not the address has an
   * account, and the only thing that differs is whether a message exists afterwards.
   *
   * Any password identity gets one, verified or not: the link goes to the mailbox, and a mailbox that
   * receives it is the same proof whether the account it belongs to can sign in yet or not.
   */
  async forgot(email: string, locale: EmailLocale): Promise<void> {
    const address = this.addressFrom(email);
    const em = this.em.fork();
    const identity = await this.identityFor(em, address);
    if (identity === null) return;

    const token = await issueAuthToken(em, identity, 'reset_password');
    await this.mailer.send(
      resetMessage(address, resetLink(this.config.clientOrigin, token), locale),
    );
  }

  /**
   * Sets a new password from a link. Every other link for the account dies with the password it was
   * minted under: a reset that left a verification link from three weeks ago alive would be a reset that
   * locked the door and left the window open.
   */
  async reset(token: string, password: string): Promise<void> {
    const em = this.em.fork();
    const identity = await consumeAuthToken(em, token, 'reset_password');
    if (identity === null) throw invalidToken();

    await this.writeCredential(em, identity, password);
    await spendTokens(em, identity);
    await em.flush();
  }

  /** The one `password` identity for an address, or nothing. The pair is the key, as it is everywhere. */
  private identityFor(em: EntityManager, address: string): Promise<Identity | null> {
    return em.findOne(
      Identity,
      { provider: PASSWORD_PROVIDER, providerUserId: address },
      { populate: ['user'] },
    );
  }

  private async writeCredential(em: EntityManager, identity: Identity, password: string): Promise<void> {
    const stored = await hashPassword(password);
    const existing = await em.findOne(PasswordCredential, { identity });

    if (existing === null) em.create(PasswordCredential, { identity, passwordHash: stored });
    else existing.passwordHash = stored;

    await em.flush();
  }

  private async mailVerification(
    em: EntityManager,
    identity: Identity,
    address: string,
    locale: EmailLocale,
  ): Promise<void> {
    const token = await issueAuthToken(em, identity, 'verify_email');
    await this.mailer.send(
      verificationMessage(address, verificationLink(this.config.clientOrigin, token), locale),
    );
  }

  /**
   * The address the mailbox just proved is the address of the account. Written onto the user when nothing
   * stronger is there: a user whose address came from a provider keeps it.
   */
  private async adoptAddress(em: EntityManager, identity: Identity): Promise<void> {
    const user = await em.findOne(User, { id: identity.user.id });
    if (user !== null && user.email === null) user.email = identity.email;
  }

  /** The one spelling of an address, from the function the linking rule uses, so the two cannot drift. */
  private addressFrom(email: string): string {
    const address = normalizeAddress(email);
    if (address === null) {
      // The controller refuses an address with no `@` before it gets here; this is the same refusal for a
      // caller that did not, rather than an empty address that becomes a row.
      throw apiError(HttpStatus.BAD_REQUEST, 'invalid_body', 'An email address is required.');
    }
    return address;
  }
}

/** What the form's name defaults to: the part of the address before the `@`. */
function localPartOf(address: string): string {
  return address.slice(0, address.indexOf('@'));
}

/**
 * A hash of a password nobody has, so that an address with no account costs what an address with one
 * costs. Computed once per process, with the parameters a real password is stored under — a cheaper one
 * would be the timing difference this exists to remove.
 */
let nothing: Promise<string> | undefined;

function againstNothing(password: string): Promise<boolean> {
  nothing ??= hashPassword(randomBytes(32).toString('base64url'));
  return nothing.then((stored) => verifyPassword(password, stored));
}

/**
 * The four refusals of this feature, in the shape the platform answers every error in. None of them says
 * which half of a credential was wrong: "no such address" and "wrong password" are one answer because the
 * difference between them is the list of who has an account here.
 */
function invalidCredentials(): HttpException {
  return apiError(
    HttpStatus.UNAUTHORIZED,
    'invalid_credentials',
    'That address and password do not match an account.',
  );
}

function emailNotVerified(): HttpException {
  return apiError(
    HttpStatus.FORBIDDEN,
    'email_not_verified',
    'Confirm your address first: the link is in the message we sent you.',
  );
}

function tooManyAttempts(): HttpException {
  return apiError(
    HttpStatus.TOO_MANY_REQUESTS,
    'too_many_attempts',
    'Too many failed sign-ins for this address. Try again in a few minutes.',
  );
}

function invalidToken(): HttpException {
  return apiError(
    HttpStatus.BAD_REQUEST,
    'invalid_token',
    'This link is no longer valid. Ask for a new one.',
  );
}
