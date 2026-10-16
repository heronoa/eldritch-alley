import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { describe, expect, it } from 'vitest';
import type { MatchEndedMessage } from './match-ended';
import { InMemoryMatchEndedPublisher, SqsMatchEndedPublisher } from './queue';

const QUEUE_URL = 'http://localhost:4566/000000000000/match-ended.fifo';

const MESSAGE: MatchEndedMessage = {
  id: '9f1c0a6e-7d2b-4c8f-9a31-5b6e0d7c2a48',
  userId: '2d9a5c31-8b7e-4f6a-9c0d-1e2f3a4b5c6d',
  seed: 4_242,
  mapId: 'overpass',
  protocolVersion: 10,
  units: [{ unitId: 'A-sniper', class: 'sniper' }],
  winner: 'A',
  result: 'won',
  rounds: 7,
  startedAt: '2026-10-16T18:00:00.000Z',
  endedAt: '2026-10-16T18:07:30.000Z',
  finalStateHash: 1_234_567,
  events: [],
};

/** Stands in for the SQS client so no case here opens a socket. */
class RecordingSender {
  readonly sent: SendMessageCommand[] = [];

  async send(command: SendMessageCommand): Promise<unknown> {
    this.sent.push(command);
    return {};
  }
}

describe('SqsMatchEndedPublisher', () => {
  it('sends one message whose body is the match, serialized', async () => {
    const sender = new RecordingSender();
    await new SqsMatchEndedPublisher(QUEUE_URL, sender).publish(MESSAGE);

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].input.QueueUrl).toBe(QUEUE_URL);
    expect(sender.sent[0].input.MessageBody).toBe(JSON.stringify(MESSAGE));
    expect(JSON.parse(sender.sent[0].input.MessageBody!)).toEqual(MESSAGE);
  });

  /**
   * The match id is what makes a second delivery of the same match impossible inside the queue's own
   * window. It is not the guarantee — the primary key the platform inserts under is (decision D2) — but
   * it is free, and it keeps the duplicate from being delivered at all.
   */
  it('deduplicates on the match id, and groups by it too', async () => {
    const sender = new RecordingSender();
    await new SqsMatchEndedPublisher(QUEUE_URL, sender).publish(MESSAGE);

    expect(sender.sent[0].input.MessageDeduplicationId).toBe(MESSAGE.id);
    // A FIFO queue requires a group, and one match is one group: a match publishes exactly one message,
    // so no match can ever hold another one up.
    expect(sender.sent[0].input.MessageGroupId).toBe(MESSAGE.id);
  });

  /**
   * Fire and forget, by design: the caller is a room that has already finished. A queue that is away
   * must not fail a match that is over, and the room is the one that decides that — this only has to
   * not swallow the failure, so that the room can log it.
   */
  it('lets a failure out, so the room can log it rather than lose it', async () => {
    const failing = {
      send: () => Promise.reject(new Error('the queue is away')),
    };

    await expect(new SqsMatchEndedPublisher(QUEUE_URL, failing).publish(MESSAGE)).rejects.toThrow(
      'the queue is away',
    );
  });
});

describe('InMemoryMatchEndedPublisher', () => {
  it('records what was published, in order, for a case to read', async () => {
    const publisher = new InMemoryMatchEndedPublisher();
    const second: MatchEndedMessage = { ...MESSAGE, id: 'another-match', result: 'lost' };

    await publisher.publish(MESSAGE);
    await publisher.publish(second);

    expect(publisher.published).toEqual([MESSAGE, second]);
  });

  it('holds nothing until something is published', () => {
    expect(new InMemoryMatchEndedPublisher().published).toEqual([]);
  });
});
