import type { EntityManager } from '@mikro-orm/postgresql';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { apiError } from '../app';
import { ENTITY_MANAGER } from '../db/database.module';
import { ContactMessage } from '../db/entities/contact-message.entity';
import { User } from '../db/entities/user.entity';
import type { EmailMessage, Mailer } from '../email/mailer';
import { MAILER } from '../email/mailer';
import { hashIp } from './ip-hash';
import { contactRateLimitKey, RATE_LIMITER, RateLimiter } from './rate-limit';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from './turnstile';

/** The longest message a person can send. Long enough for a support request, short enough to store. */
export const CONTACT_MESSAGE_LIMIT = 5_000;

/** The two values the route reads from the environment, injected as values so a test can choose them. */
export const CONTACT_IP_SALT = 'CONTACT_IP_SALT';
export const CONTACT_NOTIFY_TO = 'CONTACT_NOTIFY_TO';

/** Who sent the message: the account when the request carried a session, or a guest. */
export interface ContactSender {
  userId: string | null;
  /** The raw address, used for the hash and for Cloudflare, and for nothing else. */
  ip: string;
}

/** What the route answers when the message reached the database. */
export interface ContactReceived {
  received: true;
}

/** What a valid body carries, already trimmed. */
interface ContactFields {
  name: string;
  email: string;
  message: string;
  turnstileToken: string;
}

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The contact form's decision. The order is the contract (m4-05 § 4): the shape of the body, then the
 * per-address counter, then Cloudflare. The message is stored before the owner is told, and the
 * notification is best-effort: a message that reached the database is the artifact, and a mail server
 * that did not answer must not lose it (D3).
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @Inject(ENTITY_MANAGER) private readonly em: EntityManager,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TURNSTILE_VERIFIER) private readonly turnstile: TurnstileVerifier,
    @Inject(RATE_LIMITER) private readonly rateLimiter: RateLimiter,
    @Inject(CONTACT_IP_SALT) private readonly ipSalt: string,
    @Inject(CONTACT_NOTIFY_TO) private readonly notifyTo: string,
  ) {}

  async receive(body: unknown, sender: ContactSender): Promise<ContactReceived> {
    const fields = this.read(body);

    const ipHash = hashIp(sender.ip, this.ipSalt);
    // The count comes before the challenge, so a flood is refused by the counter without spending a
    // request on Cloudflare.
    if (!(await this.rateLimiter.take(contactRateLimitKey(ipHash)))) {
      throw apiError(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Too many messages. Try again later.');
    }

    await this.checkChallenge(fields.turnstileToken, sender.ip);

    const em = this.em.fork();
    const message = em.create(ContactMessage, {
      user: sender.userId === null ? null : em.getReference(User, sender.userId),
      name: fields.name,
      email: fields.email,
      message: fields.message,
      ipHash,
    });
    await em.persistAndFlush(message);

    await this.notify(message);
    return { received: true };
  }

  /** The body as the route reads it, or a 400 naming the field that did not survive the reading. */
  private read(body: unknown): ContactFields {
    const record = isRecord(body) ? body : {};

    const name = text(record['name']);
    if (name === null) throw invalid('name');
    const email = text(record['email']);
    if (email === null || !EMAIL_ADDRESS.test(email)) throw invalid('email');
    const message = text(record['message']);
    if (message === null || message.length > CONTACT_MESSAGE_LIMIT) throw invalid('message');
    // The token has no 400 of its own: a missing or empty token is the challenge's refusal, 403.
    const turnstileToken = text(record['turnstileToken']) ?? '';

    return { name, email, message, turnstileToken };
  }

  /** Cloudflare's answer, with an unreachable verifier answering the same as a refusal (D2). */
  private async checkChallenge(token: string, ip: string): Promise<void> {
    if (token === '') throw challengeFailed();

    let accepted: boolean;
    try {
      accepted = await this.turnstile.verify(token, ip);
    } catch {
      throw challengeFailed();
    }
    if (!accepted) throw challengeFailed();
  }

  /**
   * Tells the owner. A failure is logged with the id of the row it is about and goes no further: the
   * route has already stored the message, and the player is owed an answer of `received: true`.
   */
  private async notify(message: ContactMessage): Promise<void> {
    const notification: EmailMessage = {
      to: this.notifyTo,
      subject: `Nova mensagem de contato — ${message.name}`,
      text: [
        `De: ${message.name} <${message.email}>`,
        message.user === null ? 'Sem conta.' : `Conta: ${message.user.id}`,
        '',
        message.message,
      ].join('\n'),
    };

    try {
      await this.mailer.send(notification);
    } catch (error) {
      this.logger.error(
        `contact message ${message.id} was stored but its notification failed: ${String(error)}`,
      );
    }
  }
}

function invalid(field: string) {
  return apiError(HttpStatus.BAD_REQUEST, 'invalid_body', `The ${field} field is missing or invalid.`);
}

function challengeFailed() {
  return apiError(HttpStatus.FORBIDDEN, 'challenge_failed', 'The challenge did not pass.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
