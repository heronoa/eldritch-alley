import { createHash } from 'node:crypto';

/**
 * The address, as the database is allowed to keep it: `sha256(ip + salt)`, hex, truncated to 32
 * characters (128 bits). Two requests from one address share a hash; the same address under another
 * salt does not. The raw address is never stored and never logged.
 */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(ip + salt).digest('hex').slice(0, 32);
}
