/**
 * Per-address counting for the contact form (D1 of the m4-05 plan). The counter is a port so the
 * service can be tested without Redis, and the window and the limit are values rather than constants
 * baked into the route.
 */

/** What the limiter needs of a counter. Redis and the test's map answer the same three questions. */
export interface CounterStore {
  /** Adds one to the count and answers the new value. */
  increment(key: string): Promise<number>;
  /** Gives the key an expiry, in seconds. Called when the first request of a window arrives. */
  expire(key: string, seconds: number): Promise<void>;
  /** Seconds left in the window, as Redis reports them. */
  ttl(key: string): Promise<number>;
}

/** The counter a process uses when no Redis is configured, and the one the tests read directly. */
export class InMemoryCounterStore implements CounterStore {
  private readonly counts = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string): Promise<number> {
    const now = Date.now();
    const current = this.counts.get(key);
    const count = current === undefined || current.expiresAt <= now ? 1 : current.count + 1;
    this.counts.set(key, {
      count,
      expiresAt: current === undefined || current.expiresAt <= now ? 0 : current.expiresAt,
    });
    return count;
  }

  async expire(key: string, seconds: number): Promise<void> {
    const current = this.counts.get(key);
    if (current === undefined) return;
    current.expiresAt = Date.now() + seconds * 1000;
  }

  async ttl(key: string): Promise<number> {
    const current = this.counts.get(key);
    if (current === undefined || current.expiresAt === 0) return -1;
    return Math.max(0, Math.ceil((current.expiresAt - Date.now()) / 1000));
  }
}

/** The smallest surface of ioredis this file uses, so importing the client stays in the factory. */
export interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

/**
 * The counter that survives a restart and works across instances. The client is built lazily: a
 * container that never receives a contact request opens no socket, and a test that overrides the
 * limiter never builds one at all.
 */
export class RedisCounterStore implements CounterStore {
  private client: RedisClient | null = null;

  constructor(private readonly connect: () => RedisClient) {}

  private clientOrConnect(): RedisClient {
    this.client ??= this.connect();
    return this.client;
  }

  increment(key: string): Promise<number> {
    return this.clientOrConnect().incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.clientOrConnect().expire(key, seconds);
  }

  ttl(key: string): Promise<number> {
    return this.clientOrConnect().ttl(key);
  }
}

export interface RateLimit {
  /** How many requests one address may make in one window. */
  limit: number;
  /** The window, in seconds. */
  windowSeconds: number;
}

/** The prefix every counter key shares, so one glance at Redis says what the numbers are. */
export const CONTACT_RATE_KEY_PREFIX = 'contact:rate:';

/** The key one hashed address counts under. */
export function contactRateLimitKey(ipHash: string): string {
  return `${CONTACT_RATE_KEY_PREFIX}${ipHash}`;
}

/** Counts one request and answers whether it fits in the window. */
export class RateLimiter {
  constructor(
    private readonly counters: CounterStore,
    private readonly limit: RateLimit,
  ) {}

  async take(key: string): Promise<boolean> {
    const count = await this.counters.increment(key);
    // The expiry is set on the first request of the window, and not refreshed afterwards: the window
    // is fixed, so a flood cannot keep its own counter alive for ever.
    if (count === 1) await this.counters.expire(key, this.limit.windowSeconds);
    return count <= this.limit.limit;
  }
}

/** The token the limiter is injected by. A test replaces it with numbers it chose. */
export const RATE_LIMITER = 'RATE_LIMITER';
