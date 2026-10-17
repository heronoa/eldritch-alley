/**
 * The mail port, and the only thing the rest of the platform knows about mail. What a message is, and
 * that something can send one — nothing about SMTP, nothing about a vendor, and nothing a test has to
 * reach the network to satisfy. The two implementations are chosen by the environment (`mailer-from-environment.ts`),
 * and the route cases replace this port outright with a fake that records instead of sending.
 */
export interface EmailMessage {
  /** The one recipient. Every message this platform sends is to the address a player typed. */
  to: string;
  subject: string;
  /** Plain text only: the links have to be readable by a machine that shows no HTML, which is most of
   *  the mail a player will read this in. */
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Injected as a value, so that a test can put a recorder here and no case opens a socket. */
export const MAILER = 'MAILER';
