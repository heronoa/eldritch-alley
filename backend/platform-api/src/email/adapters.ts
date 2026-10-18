import { createTransport, type Transporter } from 'nodemailer';
import type { EmailMessage, Mailer } from './mailer';

/** Everything the SMTP adapter needs, already read and checked by `mailerFromEnvironment`. */
export interface SmtpConfig {
  host: string;
  /** 465 means TLS from the first byte; 587 and 25 start in the clear and upgrade. Both are real. */
  port: number;
  user: string;
  password: string;
  /** The `From:` header, which is a name and an address, and not the same thing as the user. */
  from: string;
}

/**
 * The adapter that reaches a real mail server — Zoho, in this deployment. It is built lazily by the
 * transport itself: `createTransport` opens nothing, so a container whose SMTP host is unreachable still
 * starts, and the first player who signs up is the one who finds out.
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.password },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

/**
 * The adapter for an environment that has no mail server: it writes the message, links included, to the
 * log and opens nothing. `npm run dev`, `npm test` and CI all run with this one, so a contributor can
 * follow a verification link out of their own terminal without an account anywhere.
 */
export class LogMailer implements Mailer {
  async send(message: EmailMessage): Promise<void> {
    // One line per field rather than one blob: the link has to be copyable out of a terminal, and a
    // wrapped line is a link somebody has to reassemble by hand.
    console.log(`[mail] to: ${message.to}\n[mail] subject: ${message.subject}\n${message.text}`);
  }
}
