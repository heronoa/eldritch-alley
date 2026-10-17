import type { Request } from 'express';

/**
 * Who is asking, for the failure counter. Behind the deployment's proxy this is the proxy's address
 * unless `trust proxy` is configured — a limit per address still holds, a limit per host does not, and
 * ADR 0021 records that the counter is only as good as the proxy in front of it.
 */
export function clientAddress(request: Request): string {
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
