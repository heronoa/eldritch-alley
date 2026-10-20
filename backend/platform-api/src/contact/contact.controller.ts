import type { Request } from 'express';
import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SESSION_CONFIG, SESSION_COOKIE_NAME, readSession, type SessionConfig } from '../auth/session';
import { clientAddress } from '../auth/client-address';
import { ContactService, type ContactReceived } from './contact.service';

/**
 * `POST /contact` — the one write a visitor may make without a session. When the browser happens to
 * carry one, the message is stored against the account; otherwise it is a guest's message, and that is
 * the whole difference.
 */
@Controller('contact')
export class ContactController {
  constructor(
    @Inject(ContactService) private readonly contacts: ContactService,
    @Inject(SESSION_CONFIG) private readonly sessionConfig: SessionConfig,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async receive(
    @Body() body: unknown,
    @Req() request: Request & AuthenticatedRequest,
  ): Promise<ContactReceived> {
    const session = await readSession(
      request.cookies?.[SESSION_COOKIE_NAME] ?? '',
      this.sessionConfig,
    );

    return this.contacts.receive(body, {
      userId: session?.userId ?? null,
      ip: clientAddress(request),
    });
  }
}
