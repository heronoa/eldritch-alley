import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  type HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { apiError } from '../app';
import type { User } from '../db/entities/user.entity';
import { checkPasswordPolicy } from './password';
import { PasswordService, type Credentials, type Registration } from './password.service';
import { SESSION_CONFIG, sessionCookie, signSession, type SessionConfig } from './session';

/**
 * The routes of a password sign-in, all of them `POST`.
 *
 * `POST` because each one is an act and not a resource: registering, following a link, entering. It also
 * keeps them clear of `GET /auth/:provider`, which is declared last and captures everything else under
 * `/auth/` — a `GET /auth/password` would be read as a provider called `password` and answer 404. And a
 * verification link that arrives as a `GET` would be spent by whatever machine reads the mailbox first
 * (ADR 0021), so the link lands on the client and the click is what posts here.
 */
@Controller('auth/password')
export class PasswordController {
  constructor(
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SESSION_CONFIG) private readonly config: SessionConfig,
  ) {}

  /** Always the same answer, whatever happened: this route never says whether an address is taken. */
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() body: unknown): Promise<Sent> {
    const input = readRegistration(body);
    checkPolicy(input.password);
    await this.passwords.register(input);
    return SENT;
  }

  @Post('verify/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  async resend(@Body() body: unknown): Promise<Sent> {
    await this.passwords.resendVerification(address(readBody(body).email));
    return SENT;
  }

  /** The click on the link. It spends the token and opens a session: the address is proved, so this is
   *  the end of the flow the message started. */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ verified: true }> {
    const user = await this.passwords.verify(token(readBody(body)));
    await this.openSession(user, response);
    return { verified: true };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: Profile }> {
    const input: Credentials = {
      email: address(readBody(body).email),
      password: string(readBody(body).password, 'password'),
    };

    const user = await this.passwords.login(input, clientAddress(request));
    await this.openSession(user, response);

    return { user: profileOf(user) };
  }

  /** The same answer for a known and for an unknown address; the only difference is the mailbox. */
  @Post('forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgot(@Body() body: unknown): Promise<Sent> {
    await this.passwords.forgot(address(readBody(body).email));
    return SENT;
  }

  /** Nothing to hand back: the password is set, and the session is opened by the sign-in that follows. */
  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Body() body: unknown): Promise<void> {
    const fields = readBody(body);
    const password = string(fields.password, 'password');
    checkPolicy(password);

    await this.passwords.reset(token(fields), password);
  }

  /**
   * The cookie every way in ends with — the same value the OAuth callback sets, signed the same way, so
   * that everything downstream of the session is the code that is already reviewed.
   */
  private async openSession(user: User, response: Response): Promise<void> {
    const session = await signSession(
      { userId: user.id, sessionId: randomUUID(), issuedAt: Date.now() },
      this.config,
    );
    response.setHeader('Set-Cookie', sessionCookie(session, this.config));
  }
}

/** The one answer a route that must not say anything gives. */
const SENT: Sent = { status: 'sent' };
type Sent = { status: 'sent' };

interface Profile {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

/** The same shape `GET /me` answers with, so the client has one profile to render and not two. */
function profileOf(user: User): Profile {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

function readRegistration(body: unknown): Registration {
  const fields = readBody(body);
  const displayName = fields.displayName;

  return {
    email: address(fields.email),
    password: string(fields.password, 'password'),
    ...(typeof displayName === 'string' && displayName.trim() !== ''
      ? { displayName: displayName.trim() }
      : {}),
  };
}

/** The body of a request as an object, or the one refusal a request that is not one gets. */
function readBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalidBody('A JSON object is required.');
  }
  return body as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') {
    throw invalidBody(`${name} is required.`);
  }
  return value;
}

function token(fields: Record<string, unknown>): string {
  return string(fields.token, 'token');
}

/**
 * A shape check and not a grammar: what makes an address an address is that mail to it arrives, and the
 * only machine that can answer that is the one that sends the mail. This is here so that a typo does not
 * become an identity nothing can ever verify.
 */
function address(value: unknown): string {
  const email = string(value, 'email');
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw invalidBody('email must look like an address.');
  return email;
}

/**
 * The length policy, turned into the shape every other refusal has. It is checked here and not deeper
 * because it is a rule about a request, and the sentence that explains it is worth keeping the limit in.
 */
function checkPolicy(password: string): void {
  try {
    checkPasswordPolicy(password);
  } catch (error) {
    throw apiError(HttpStatus.BAD_REQUEST, 'invalid_password', (error as Error).message);
  }
}

function invalidBody(message: string): HttpException {
  return apiError(HttpStatus.BAD_REQUEST, 'invalid_body', message);
}

/**
 * Who is asking, for the failure counter. Behind the deployment's proxy this is the proxy's address
 * unless `trust proxy` is configured — a limit per address still holds, a limit per host does not, and
 * the ADR records that the counter is only as good as the proxy in front of it.
 */
function clientAddress(request: Request): string {
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
