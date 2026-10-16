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
import { DatabaseModule } from './db/database.module';
import { MAILER } from './email/mailer';
import { mailerFromEnvironment } from './email/mailer-from-environment';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';

/**
 * The whole platform in one module. Every configuration value is read by its own factory while the
 * container is being built, so a missing secret or a malformed key stops the boot instead of failing on
 * the request that first needed it. The providers object is a value on purpose: a test puts two
 * providers of its own there and the rest of the application is what runs (src/auth/test-app.ts).
 *
 * The mailer is a value for the same reason, and it is the one factory that answers something other than
 * a refusal when it is not configured: with no `EMAIL_*` value it writes to the log and sends nothing, so
 * a contributor and CI boot with no mail account anywhere (§ 9, D14).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, OAuthController, PasswordController, AuthController, MeController],
  providers: [
    { provide: SESSION_CONFIG, useFactory: sessionConfigFromEnvironment },
    { provide: GAME_TICKET_CONFIG, useFactory: gameTicketConfigFromEnvironment },
    { provide: OAUTH_PROVIDERS, useFactory: oauthProvidersFromEnvironment },
    { provide: MAILER, useFactory: mailerFromEnvironment },
    { provide: FAILURE_THROTTLE, useFactory: () => new InMemoryFailureThrottle() },
    AuthService,
    PasswordService,
    SessionGuard,
  ],
})
export class AppModule {}
