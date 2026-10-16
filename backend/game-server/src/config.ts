// The match server's configuration, read from the process environment. Each value is checked where it
// is read, so a bad one stops the server at boot instead of failing when it is first used.

/**
 * A TCP port from the environment, or the fallback when the variable is not set. Anything that is not a
 * whole number between 1 and 65535 throws: `Number('abc')` is NaN, and `listen(NaN)` picks a random port.
 */
export function readPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`port must be an integer between 1 and 65535, got ${raw}`);
  }
  return port;
}

/**
 * How many matches this process may have open at once, from the environment, or the fallback when
 * the variable is not set. Counts rooms, not clients — `BattleRoom.maxClients` already caps those.
 * Per process: with no shared presence between game-server processes yet, more than one process
 * behind the load balancer multiplies this rather than sharing one global count.
 */
export function readMaxConcurrentMatches(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;

  const max = Number(raw);
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`max concurrent matches must be a positive integer, got ${raw}`);
  }
  return max;
}
