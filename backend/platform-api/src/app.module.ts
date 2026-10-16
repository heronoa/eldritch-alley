import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { GAME_TICKET_CONFIG, gameTicketConfigFromEnvironment } from './auth/game-ticket';
import { OAuthController } from './auth/oauth.controller';
import { PasswordController } from './auth/password.controller';
import { PasswordService } from './auth/password.service';
import { OAUTH_PROVIDERS, oauthProvidersFromEnvironment } from './auth/provider';
import { SESSION_CONFIG, sessionConfigFromEnvironment } from './auth/session';
import { SessionGuard } from './auth/session.guard';
import { FAILURE_THROTTLE, InMemoryFailureThrottle } from './auth/throttle';
import { readMatchEndedQueueUrl, readPollIntervalMs } from './config';
import { DatabaseModule } from './db/database.module';
import { MAILER } from './email/mailer';
import { mailerFromEnvironment } from './email/mailer-from-environment';
import { HealthController } from './health/health.controller';
import { MatchEndedConsumer } from './matches/match-ended.consumer';
import { MatchesController } from './matches/matches.controller';
import { MatchesService } from './matches/matches.service';
import { MeController } from './me/me.controller';
import { MATCH_ENDED_POLL_INTERVAL_MS, MATCH_ENDED_QUEUE, sqsQueueFromEnvironment } from './queue/queue';

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
    AuthService,
    PasswordService,
    SessionGuard,
    MatchesService,
    MatchEndedConsumer,
  ],
})
export class AppModule {}
