import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

type RequestWithId = Request & { requestId: string };

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-request-id'];
  const requestId = typeof header === 'string' && header.trim() ? header.trim() : randomUUID();
  (req as RequestWithId).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  requestContext.run({ requestId }, () => next());
}

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

export function logScope(scope: string, message: string, extra?: Record<string, unknown>): void {
  const requestId = currentRequestId();
  console.log(JSON.stringify({ scope, message, requestId, ...extra }));
}
