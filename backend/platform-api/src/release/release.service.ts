import { randomBytes } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { apiError } from '../app';
import { unauthenticated } from '../auth/session.guard';
import { ENTITY_MANAGER } from '../db/database.module';
import { ReleaseSubscription } from '../db/entities/release-subscription.entity';
import { User } from '../db/entities/user.entity';
import { resolveEmailLocale, type EmailLocale } from '../email/locale';

/** What the profile reports about the release e-mails, and what a PATCH answers. */
export interface ReleaseEmails {
  optedIn: boolean;
  consentedAt: string | null;
}

/**
 * The consent record and the unsubscribe token (m4-05 § 4). One row per account; the token is created
 * on the first opt-in and never changes; opting out is not an erasure, and the consent date stays.
 */
@Injectable()
export class ReleaseService {
  constructor(@Inject(ENTITY_MANAGER) private readonly em: EntityManager) {}

  /** The subscription as the profile reads it, or `null` when nobody has decided anything yet. */
  state(userId: string): Promise<ReleaseSubscription | null> {
    return this.em.fork().findOne(ReleaseSubscription, { user: { id: userId } });
  }

  /**
   * Records a decision. Opting in writes the date, clears the unsubscribe date and keeps the token;
   * opting out leaves the consent date where it was.
   */
  async set(userId: string, optedIn: boolean, locale: EmailLocale): Promise<ReleaseSubscription> {
    const em = this.em.fork();
    const user = await em.findOne(User, { id: userId });
    if (user === null) throw unauthenticated();

    let subscription = await em.findOne(ReleaseSubscription, { user: { id: userId } });

    if (subscription === null) {
      // A row written by an opt-out that never opted in carries a token like any other row: the
      // account may opt in later, and the link in a message must be stable from the first yes.
      subscription = em.create(ReleaseSubscription, {
        user,
        email: user.email ?? '',
        optedIn,
        locale,
        token: newToken(),
      });
      em.persist(subscription);
    } else {
      subscription.optedIn = optedIn;
      subscription.locale = locale;
    }

    if (optedIn) {
      subscription.consentedAt = new Date();
      subscription.unsubscribedAt = null;
    }

    await em.flush();
    return subscription;
  }

  /**
   * The click in the message. An unknown token is a 404 and changes nothing; a known one opts the
   * account out, and a second click on an old message answers 200 without moving the date.
   */
  async unsubscribe(token: string): Promise<ReleaseSubscription> {
    const em = this.em.fork();
    const subscription = await em.findOne(ReleaseSubscription, { token });

    if (subscription === null) {
      throw apiError(HttpStatus.NOT_FOUND, 'unknown_token', 'This unsubscribe link is not valid.');
    }

    if (!subscription.optedIn && subscription.unsubscribedAt !== null) return subscription;

    subscription.optedIn = false;
    subscription.unsubscribedAt ??= new Date();
    await em.flush();
    return subscription;
  }
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The small page the clicked link answers with, in the language the message was written in. */
export function unsubscribePage(locale: string): string {
  const copy =
    resolveEmailLocale(locale) === 'pt-BR'
      ? {
          lang: 'pt-BR',
          title: 'Inscrição cancelada',
          heading: 'Pronto',
          body:
            'Este endereço não vai mais receber os avisos de lançamento do Eldritch Alley: Tactics. ' +
            'O seu consentimento foi retirado e nenhum outro e-mail de novidades será enviado.',
        }
      : {
          lang: 'en-US',
          title: 'Unsubscribed',
          heading: 'Done',
          body:
            'This address will no longer receive release news from Eldritch Alley: Tactics. ' +
            'Your consent has been withdrawn and no further release e-mail will be sent.',
        };

  return [
    '<!doctype html>',
    `<html lang="${copy.lang}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${copy.title}</title>`,
    '</head>',
    '<body>',
    '<main>',
    `<h1>${copy.heading}</h1>`,
    `<p>${copy.body}</p>`,
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}
