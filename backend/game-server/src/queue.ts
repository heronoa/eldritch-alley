// Where a finished match goes. A port, one adapter that reaches SQS, and one that records in memory —
// because the tests must not need a queue any more than the suite needs a mail server.
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { MatchEndedMessage } from './match-ended';

/**
 * The one thing a room asks of the outside world. It is a port and not an SQS call so that the room can
 * be handed something else, and so that a queue that is away cannot be mistaken for a match that failed.
 */
export interface MatchEndedPublisher {
  publish(message: MatchEndedMessage): Promise<void>;
}

/** The part of the SQS client this uses. Narrower than the client, so a case can stand in for it. */
export interface SqsSender {
  send(command: SendMessageCommand): Promise<unknown>;
}

/**
 * Publishes to the match queue, which is a FIFO one: the match id is both the deduplication id and the
 * message group.
 *
 * The group is the match and not the player on purpose. A FIFO queue delivers a group in order and holds
 * the rest of the group back while one message is being retried, so grouping by match keeps a match that
 * the platform cannot store from holding up anybody else's — and it costs nothing, because a match
 * publishes exactly one message.
 */
export class SqsMatchEndedPublisher implements MatchEndedPublisher {
  constructor(
    private readonly queueUrl: string,
    private readonly client: SqsSender,
  ) {}

  async publish(message: MatchEndedMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageDeduplicationId: message.id,
        MessageGroupId: message.id,
      }),
    );
  }
}

/**
 * The production publisher. The client lives as long as the process does, which is what a client on a
 * server is for: nothing here has a shutdown to hang it off, and a socket left open at exit costs
 * nothing that the process's own exit does not already settle.
 */
export function sqsPublisherFromEnvironment(queueUrl: string): MatchEndedPublisher {
  return new SqsMatchEndedPublisher(queueUrl, new SQSClient({}));
}

/** Records instead of sending, which is what keeps a suite off the network. */
export class InMemoryMatchEndedPublisher implements MatchEndedPublisher {
  readonly published: MatchEndedMessage[] = [];

  async publish(message: MatchEndedMessage): Promise<void> {
    this.published.push(message);
  }
}
