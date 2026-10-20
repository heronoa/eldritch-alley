/**
 * How many failed sign-ins one address, and one address of the internet, may have inside the window.
 *
 * Ten for an address is far more than a person needs and far less than a guessing attack wants. A
 * hundred for an address of the internet, because an IP address is shared — a household, an office, a
 * university — and a low limit there would lock out strangers for each other's mistakes. The second
 * number is not a guess at an attacker's patience; it is the cap that keeps one host from spending the
 * platform's CPU on hashes.
 */
export const DEFAULT_MAX_FAILURES = 10;
export const DEFAULT_MAX_FAILURES_PER_IP = 100;

/** Fifteen minutes. Long enough that guessing is pointless, short enough that a locked-out player waits. */
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** Injected as a value: the counter is state, and a test that wants a fresh one starts a fresh container. */
export const FAILURE_THROTTLE = 'FAILURE_THROTTLE';

export interface FailureThrottle {
  /** Whether either key has failed too often inside the window. Asked before the password is checked. */
  tooMany(address: string, ip: string): boolean;
  /** One failed attempt, counted against both keys. */
  record(address: string, ip: string): void;
  /**
   * Forgets what an address has done. Only a successful sign-in calls it — and it never clears the IP,
   * because an attacker holding one working account would otherwise reset their own counter at will.
   */
  clear(address: string): void;
}

/**
 * The counters, in this process's memory.
 *
 * In memory because the platform is one process and this milestone adds no infrastructure to it. The
 * honest limits, recorded in ADR 0021 rather than discovered later: a restart clears every counter, and a
 * second instance would count half an attacker's attempts. m4-05's Redis is where this moves when the
 * platform is scaled out.
 */
export class InMemoryFailureThrottle implements FailureThrottle {
  private readonly addresses = new Counter(DEFAULT_MAX_FAILURES);
  private readonly ips = new Counter(DEFAULT_MAX_FAILURES_PER_IP);

  tooMany(address: string, ip: string): boolean {
    return this.addresses.tooMany(address) || this.ips.tooMany(ip);
  }

  record(address: string, ip: string): void {
    this.addresses.record(address);
    this.ips.record(ip);
  }

  clear(address: string): void {
    this.addresses.clear(address);
  }
}

/**
 * A sliding window of failures for one key: the times of the attempts that are still inside the window,
 * and nothing else. A window that slid is a window that does not punish a player for a mistake they made
 * last week.
 */
class Counter {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly limit: number) {}

  tooMany(key: string): boolean {
    return this.inside(key).length >= this.limit;
  }

  record(key: string): void {
    const times = this.inside(key);
    times.push(Date.now());
    this.failures.set(key, times);
  }

  clear(key: string): void {
    this.failures.delete(key);
  }

  /** The failures of a key that have not aged out, dropping the ones that have as it goes. */
  private inside(key: string): number[] {
    const cutoff = Date.now() - FAILURE_WINDOW_MS;
    const times = (this.failures.get(key) ?? []).filter((at) => at > cutoff);

    // The map is pruned here and not by a timer: a key that stops failing stops being held, which is what
    // keeps this from growing with the number of addresses the platform has ever refused.
    if (times.length === 0) this.failures.delete(key);
    else this.failures.set(key, times);

    return times;
  }
}
