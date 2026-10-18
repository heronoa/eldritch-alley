import { Module } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Redis } from 'ioredis';
import { AccountDeletionService } from './auth/account-deletion.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { GAME_TICKET_CONFIG, gameTicketConfigFromEnvironment } from './auth/game-ticket';
import { OAuthController } from './auth/oauth.controller';
import { PasswordController } from './auth/password.controller';
import { PasswordService } from './auth/password.service';
import { OAUTH_PROVIDERS, oauthProvidersFromEnvironment } from './auth/provider';
import { SESSION_CONFIG, sessionConfigFromEnvironment } from './auth/session';
import { SessionGuard, UserSessionGuard } from './auth/session.guard';
import { FAILURE_THROTTLE, InMemoryFailureThrottle } from './auth/throttle';
import {
  readContactRateLimit,
  readContactRateWindowSeconds,
  readMatchEndedQueueUrl,
  readOptional,
  readPollIntervalMs,
  readRequired,
} from './config';
import { ContactController } from './contact/contact.controller';
import { ContactService } from './contact/contact.service';
import {
  InMemoryCounterStore,
  RATE_LIMITER,
  RateLimiter,
  RedisCounterStore,
  type CounterStore,
} from './contact/rate-limit';
import { TURNSTILE_VERIFIER, turnstileFromEnvironment, type TurnstileVerifier } from './contact/turnstile';
import { DatabaseModule, ENTITY_MANAGER } from './db/database.module';
import { MAILER, type Mailer } from './email/mailer';
import { mailerFromEnvironment } from './email/mailer-from-environment';
import { HealthController } from './health/health.controller';
import { MatchEndedConsumer } from './matches/match-ended.consumer';
import { MatchesController } from './matches/matches.controller';
import { MatchesService } from './matches/matches.service';
import { MeController } from './me/me.controller';
import { MATCH_ENDED_POLL_INTERVAL_MS, MATCH_ENDED_QUEUE, sqsQueueFromEnvironment } from './queue/queue';
import { ReleaseController } from './release/release.controller';
import { ReleaseService } from './release/release.service';

/**
 * The counter the contact form uses. Redis when `REDIS_URL` is configured, because a limit that two
 * instances each keep in their own memory is a limit twice as large; the process's memory otherwise, so
 * a contributor with no Redis still gets a limit (D1).
 */
function rateLimiterFromEnvironment(): RateLimiter {
  const redisUrl = readOptional(process.env.REDIS_URL);
  const counters: CounterStore =
    redisUrl === undefined
      ? new InMemoryCounterStore()
      : new RedisCounterStore(() => new Redis(redisUrl));

  return new RateLimiter(counters, {
    limit: readContactRateLimit(process.env.CONTACT_RATE_LIMIT),
    windowSeconds: readContactRateWindowSeconds(process.env.CONTACT_RATE_WINDOW_SECONDS),
  });
}

/** The two values the contact route reads, checked at boot rather than on the first message. */
function contactOption(name: string): string {
  return readRequired(process.env[name], name);
}

/**
 * The whole platform in one module. Every configuration value is read by its own factory while the
 * container is being built, so a missing secret or a malformed key stops the boot instead of failing on
 * the request that first needed it. The providers object is a value on purpose: a test puts two
 * providers of its own there and the rest of the application is what runs (src/auth/test-app.ts).
 *
 * The mailer is a value for the same reason, and it is the one factory that answers something other than
 * a refusal when it is not configured: with no `EMAIL_*` value it writes to the log and sends nothing, so
 * a contributor and CI boot with no mail account anywhere (§ 9, D14). The match queue is the other way
 * round — a platform that cannot read it has an empty battle history — and a test replaces it with the
 * in-memory one rather than leaving it unset.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [
    HealthController,
    OAuthController,
    PasswordController,
    AuthController,
    MeController,
    MatchesController,
    ContactController,
    ReleaseController,
  ],
  providers: [
    { provide: SESSION_CONFIG, useFactory: sessionConfigFromEnvironment },
    { provide: GAME_TICKET_CONFIG, useFactory: gameTicketConfigFromEnvironment },
    { provide: OAUTH_PROVIDERS, useFactory: oauthProvidersFromEnvironment },
    { provide: MAILER, useFactory: mailerFromEnvironment },
    {
      provide: MATCH_ENDED_QUEUE,
      useFactory: () => sqsQueueFromEnvironment(readMatchEndedQueueUrl(process.env.MATCH_ENDED_QUEUE_URL)),
    },
    {
      provide: MATCH_ENDED_POLL_INTERVAL_MS,
      useFactory: () => readPollIntervalMs(process.env.MATCH_ENDED_POLL_INTERVAL_MS),
    },
    { provide: FAILURE_THROTTLE, useFactory: () => new InMemoryFailureThrottle() },
    { provide: TURNSTILE_VERIFIER, useFactory: turnstileFromEnvironment },
    { provide: RATE_LIMITER, useFactory: rateLimiterFromEnvironment },
    {
      provide: ContactService,
      useFactory: (
        em: EntityManager,
        mailer: Mailer,
        turnstile: TurnstileVerifier,
        rateLimiter: RateLimiter,
      ) =>
        new ContactService(
          em,
          mailer,
          turnstile,
          rateLimiter,
          contactOption('CONTACT_IP_SALT'),
          contactOption('CONTACT_NOTIFY_TO'),
        ),
      inject: [ENTITY_MANAGER, MAILER, TURNSTILE_VERIFIER, RATE_LIMITER],
    },
    AuthService,
    AccountDeletionService,
    PasswordService,
    SessionGuard,
    UserSessionGuard,
    MatchesService,
    MatchEndedConsumer,
    ReleaseService,
  ],
})
export class AppModule {}
