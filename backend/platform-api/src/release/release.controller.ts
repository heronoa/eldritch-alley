import { Controller, Get, Header, Inject, Param } from '@nestjs/common';
import { ReleaseService, unsubscribePage } from './release.service';

/**
 * `GET /unsubscribe/:token` — the link in a release message. No session: the token is the whole
 * proof, and the answer is HTML because a person clicks this in a mailbox and lands in a browser.
 */
@Controller('unsubscribe')
export class ReleaseController {
  constructor(@Inject(ReleaseService) private readonly releases: ReleaseService) {}

  @Get(':token')
  @Header('content-type', 'text/html; charset=utf-8')
  async unsubscribe(@Param('token') token: string): Promise<string> {
    const subscription = await this.releases.unsubscribe(token);
    return unsubscribePage(subscription.locale);
  }
}
