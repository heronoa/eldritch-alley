import { describe, expect, it } from 'vitest';
import { advance, emptyQueue, enqueue, isIdle } from './animationQueue';

describe('animationQueue', () => {
  it('starts idle, with nothing current and nothing pending', () => {
    const queue = emptyQueue<string>();

    expect(isIdle(queue)).toBe(true);
    expect(queue.current).toBeNull();
    expect(queue.pending).toEqual([]);
  });

  it('becomes current the moment it is enqueued onto an idle queue', () => {
    const queue = enqueue(emptyQueue<string>(), 'a');

    expect(isIdle(queue)).toBe(false);
    expect(queue.current).toBe('a');
    expect(queue.pending).toEqual([]);
  });

  it('waits behind whatever is already current, in the order it arrived', () => {
    let queue = enqueue(emptyQueue<string>(), 'a');
    queue = enqueue(queue, 'b');
    queue = enqueue(queue, 'c');

    expect(queue.current).toBe('a');
    expect(queue.pending).toEqual(['b', 'c']);
  });

  it('promotes the next pending step once the current one is advanced past', () => {
    let queue = enqueue(emptyQueue<string>(), 'a');
    queue = enqueue(queue, 'b');
    queue = enqueue(queue, 'c');

    queue = advance(queue);
    expect(queue.current).toBe('b');
    expect(queue.pending).toEqual(['c']);

    queue = advance(queue);
    expect(queue.current).toBe('c');
    expect(queue.pending).toEqual([]);
  });

  it('goes back to idle once the last step is advanced past', () => {
    let queue = enqueue(emptyQueue<string>(), 'a');
    queue = advance(queue);

    expect(isIdle(queue)).toBe(true);
    expect(queue.current).toBeNull();
  });

  it('advancing an already-idle queue leaves it idle', () => {
    expect(advance(emptyQueue<string>())).toEqual(emptyQueue<string>());
  });
});
