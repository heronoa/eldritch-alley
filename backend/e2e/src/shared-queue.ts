// The one object the two services meet on.
//
// The match server asks the outside world for a `MatchEndedPublisher` and the platform asks it for a
// `MatchEndedQueue`. Both are ports, and in TypeScript a port is a shape: one class can be both, and
// then the message a room publishes is the message the consumer reads. That is the whole point of this
// file. There is no broker and no second adapter, so there is nothing that could disagree with the
// first about what a message is — and no test here needs LocalStack, a port or a socket.
//
// The two imports are types only, which is what keeps the AWS SDK out of the process: an `import type`
// is erased, and nothing in this suite loads a queue client it does not use.
import type { MatchEndedMessage } from '../../game-server/src/match-ended';
import type { MatchEndedPublisher } from '../../game-server/src/queue';
import type { MatchEndedQueue, ReceivedMatchEnded } from '../../platform-api/src/queue/queue';

/** One message that has been published and not yet deleted. */
interface Waiting {
  handle: string;
  body: string;
}

export class SharedMatchEndedQueue implements MatchEndedPublisher, MatchEndedQueue {
  /** Every body published, in order, deleted or not: what a case asserts the room did and did not send. */
  readonly published: string[] = [];

  private waiting: Waiting[] = [];
  private next = 0;

  /** The room's half. The body is the JSON of the message, exactly as the SQS adapter would send it. */
  async publish(message: MatchEndedMessage): Promise<void> {
    const body = JSON.stringify(message);
    this.published.push(body);
    this.waiting.push({ handle: `shared-${(this.next += 1)}`, body });
  }

  /**
   * The platform's half. A message stays until it is deleted, which is a visibility timeout of zero:
   * what the consumer's contract is about is that a message it could not store comes back, not the
   * clock it comes back on.
   */
  async receive(max: number): Promise<ReceivedMatchEnded[]> {
    return this.waiting.slice(0, max).map(({ handle, body }) => ({ handle, body }));
  }

  async delete(handle: string): Promise<void> {
    this.waiting = this.waiting.filter((message) => message.handle !== handle);
  }
}
