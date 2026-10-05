import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';

import type { RequestWithId } from '../types/request-with-id.type.js';

const logger = new Logger('HTTP');

function resolveRequestId(request: RequestWithId): string {
  const incoming = request.headers['x-request-id'];

  if (typeof incoming === 'string' && incoming.trim()) {
    return incoming.trim().slice(0, 128);
  }

  if (Array.isArray(incoming) && incoming[0]?.trim()) {
    return incoming[0].trim().slice(0, 128);
  }

  return randomUUID();
}

export function requestContextMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = process.hrtime.bigint();
  const requestId = resolveRequestId(request);

  request.id = requestId;
  response.setHeader('X-Request-Id', requestId);

  response.on('finish', () => {
    const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
    const durationMs = Number(elapsedNanoseconds) / 1_000_000;

    logger.log(
      JSON.stringify({
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      }),
    );
  });

  next();
}
