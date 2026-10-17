// Where finished matches arrive from. A port, one adapter that reaches SQS, and one that holds the
// messages in memory — the tests must not need a queue any more than they need a mail server.
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';

/** The injection token the consumer reads its queue from. */
export const MATCH_ENDED_QUEUE = 'MATCH_ENDED_QUEUE';

/** How often the consumer looks, in milliseconds, when `MATCH_ENDED_POLL_INTERVAL_MS` says nothing. */
export const MATCH_ENDED_POLL_INTERVAL_MS = 'MATCH_ENDED_POLL_INTERVAL_MS';

/**
 * One delivery of one message. The handle is the queue's own name for this delivery and the only thing a
 * delete can use, which is what makes "received" and "dealt with" two separate steps: a message the
 * platform could not store is simply never deleted, and the queue hands it over again.
 */
export interface ReceivedMatchEnded {
  handle: string;
  body: string;
}

/** What the consumer asks of the queue. Nothing here stores or parses: that is the consumer's. */
export interface MatchEndedQueue {
  /** Up to `max` messages. An empty array means there was nothing waiting, which is not a failure. */
  receive(max: number): Promise<ReceivedMatchEnded[]>;
  /** Removes the delivery for good. Only ever called for a message that has been dealt with. */
  delete(handle: string): Promise<void>;
}

/**
 * The part of the SQS client this uses, as two overloads rather than one loose method: a client that
 * answered `unknown` to both would let a case stand in for SQS without asserting anything about what it
 * was asked.
 */
export interface SqsCommands {
  send(command: ReceiveMessageCommand): Promise<{ Messages?: Message[] }>;
  send(command: DeleteMessageCommand): Promise<unknown>;
}

/**
 * Reads and deletes from the match queue.
 *
 * `WaitTimeSeconds: 0` and not the twenty the API allows, because the polling interval is the consumer's
 * and it is configured in one place: a long poll would make shutdown wait for the receive to come back,
 * and would put the interval in two places instead of one. One poll per interval is the whole design.
 */
export class SqsMatchEndedQueue implements MatchEndedQueue {
  constructor(
    private readonly queueUrl: string,
    private readonly client: SqsCommands,
  ) {}

  async receive(max: number): Promise<ReceivedMatchEnded[]> {
    const answer = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: max,
        WaitTimeSeconds: 0,
      }),
    );

    return (answer.Messages ?? []).flatMap((message) => {
      // A delivery with no receipt handle cannot be deleted, so acting on it could only ever end in the
      // message coming back. SQS does not send one, and dropping it is better than storing a match the
      // platform can never mark as done.
      if (message.ReceiptHandle === undefined) return [];
      return [{ handle: message.ReceiptHandle, body: message.Body ?? '' }];
    });
  }

  async delete(handle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: handle }),
    );
  }
}

/**
 * The production queue. The client lives as long as the process does, which is what a client on a server
 * is for: nothing here has a shutdown to hang it off.
 */
export function sqsQueueFromEnvironment(queueUrl: string): MatchEndedQueue {
  return new SqsMatchEndedQueue(queueUrl, new SQSClient({}));
}

interface WaitingMessage {
  handle: string;
  body: string;
  /** How many times it has been handed over, which is what the redrive policy counts. */
  received: number;
}

/**
 * Holds the messages in memory. What the consumer's cases run against, and what a case uses when it wants
 * a queue that can be made to fail on demand.
 *
 * It models the two things the consumer's contract is about and nothing else. A message that is not
 * deleted is handed over again on the next pass, which is SQS with a visibility timeout of zero: what
 * matters here is the redelivery, not the clock. And a message received more than `maxReceiveCount`
 * times is dropped and recorded, which is the redrive policy — the same number the queue is created with
 * in `docker/localstack/init/01-queues.sh`, and the reason the sibling of this class exists at all.
 */
export class InMemoryMatchEndedQueue implements MatchEndedQueue {
  /** What the real queue is created with. The two have to agree, and nothing enforces that but this. */
  static readonly DEFAULT_MAX_RECEIVE_COUNT = 5;

  /** The bodies the queue gave up on, which in production are the dead-letter queue. */
  readonly deadLettered: string[] = [];

  /** How many times a pass has looked, which is how a case counts the polling. */
  receives = 0;

  private waiting: WaitingMessage[] = [];
  private next = 0;

  constructor(
    private readonly maxReceiveCount = InMemoryMatchEndedQueue.DEFAULT_MAX_RECEIVE_COUNT,
  ) {}

  /** Puts a body on the queue, the way the match server's publisher would have. */
  deliver(body: string): void {
    this.waiting.push({ handle: `in-memory-${(this.next += 1)}`, body, received: 0 });
  }

  async receive(max: number): Promise<ReceivedMatchEnded[]> {
    this.receives += 1;

    // Everything the previous pass handed over and nobody deleted is available again.
    const handedOver: ReceivedMatchEnded[] = [];
    const stillWaiting: WaitingMessage[] = [];

    for (const message of this.waiting) {
      if (handedOver.length === max) {
        stillWaiting.push(message);
        continue;
      }

      message.received += 1;
      if (message.received > this.maxReceiveCount) {
        this.deadLettered.push(message.body);
        continue;
      }

      handedOver.push({ handle: message.handle, body: message.body });
      // Kept, and not deleted: it comes back on the next pass unless the consumer deletes it.
      stillWaiting.push(message);
    }

    this.waiting = stillWaiting;
    return handedOver;
  }

  async delete(handle: string): Promise<void> {
    this.waiting = this.waiting.filter((message) => message.handle !== handle);
  }
}
