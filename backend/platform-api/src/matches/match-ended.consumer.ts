import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { readMatchEnded } from './match-ended';
import { MatchesService } from './matches.service';
import { MATCH_ENDED_POLL_INTERVAL_MS, MATCH_ENDED_QUEUE, type MatchEndedQueue, type ReceivedMatchEnded } from '../queue/queue';

/** SQS's own ceiling on one receive, and the whole of why a pass is a pass. */
const BATCH = 10;

/** How much of a body that is not a message goes to the log. A match is thousands of events long. */
const LOGGED_BODY = 200;

/**
 * The bridge between the match server and the battle history: it polls the queue, hands each body to
 * `MatchesService`, and deletes the message only once it has been dealt with.
 *
 * Every rule here is about which failures are allowed to cost what (D3). A body that is not a message is
 * discarded — no number of attempts will make `"not json"` parse, and a poison pill retried forever is
 * what the dead-letter queue exists to prevent. A body that *is* a message and could not be stored is
 * left exactly where it is, because the likeliest reason is a database that was briefly away, and the
 * queue's redelivery is a better answer than a log line nobody reads.
 */
@Injectable()
export class MatchEndedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchEndedConsumer.name);

  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;

  constructor(
    @Inject(MATCH_ENDED_QUEUE) private readonly queue: MatchEndedQueue,
    @Inject(MatchesService) private readonly matches: MatchesService,
    @Inject(MATCH_ENDED_POLL_INTERVAL_MS) private readonly pollIntervalMs: number,
  ) {}

  onModuleInit(): void {
    // A pass may well take longer than the interval — a batch of ten matches against a database that is
    // thinking — and `running` is what keeps the next tick from starting a second pass over the same
    // messages. A skipped tick costs nothing: the queue holds a message until it is deleted.
    this.timer = setInterval(() => void this.drain(), this.pollIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * One look at the queue: whatever it hands over, dealt with, and nothing else. A pass and not a loop
   * until the queue is empty, for two reasons — the queue is what decides when a message comes back, and
   * a consumer that kept asking would spin on a message it cannot store instead of letting the redrive
   * policy count the attempts.
   *
   * Anything the queue itself throws ends the pass and is logged. It is not a message's fault, and the
   * messages already dealt with in this batch are deleted (below), so a queue that fails half way
   * through costs the next pass nothing.
   */
  async drain(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;

    try {
      for (const message of await this.queue.receive(BATCH)) {
        await this.handle(message);
      }
    } catch (error) {
      this.logger.error('match-ended: the queue could not be read', error);
    } finally {
      this.running = false;
    }
  }

  private async handle(message: ReceivedMatchEnded): Promise<void> {
    const ended = readMatchEnded(message.body);

    if (ended === null) {
      this.logger.warn(
        `match-ended: discarding a body that is not a message: ${message.body.slice(0, LOGGED_BODY)}`,
      );
      await this.queue.delete(message.handle);
      return;
    }

    try {
      await this.matches.store(ended);
    } catch (error) {
      // Not deleted, so the queue hands it over again. `false` is not this: a match that was already
      // stored has been dealt with, and falls through to the delete like any other.
      this.logger.error(`match-ended: match ${ended.id} was not stored`, error);
      return;
    }

    await this.queue.delete(message.handle);
  }
}
