import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import type { ApiErrorResponse } from '../interfaces/api-response.interface.js';
import type { RequestWithId } from '../types/request-with-id.type.js';

interface HttpExceptionPayload {
  code?: string;
  error?: string;
  message?: string | string[];
  fields?: Record<string, string[]>;
  details?: unknown;
}

interface ResolvedErrorPayload {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = this.resolvePayload(exception, statusCode);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        JSON.stringify({
          requestId: request.id,
          method: request.method,
          path: request.originalUrl,
          statusCode,
          error:
            exception instanceof Error
              ? exception.message
              : 'Unknown error',
        }),
        stack,
      );
    }

    const body: ApiErrorResponse = {
      code: payload.code,
      message: payload.message,
      statusCode,
      path: request.originalUrl,
      traceId: request.id,
      timestamp: new Date().toISOString(),
      ...(payload.fields ? { errors: payload.fields } : {}),
      ...(payload.details !== undefined
        ? { details: payload.details }
        : {}),
    };

    response.status(statusCode).json(body);
  }

  private resolvePayload(
    exception: unknown,
    statusCode: number,
  ): ResolvedErrorPayload {
    if (!(exception instanceof HttpException)) {
      return {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      };
    }

    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        code: `HTTP_${statusCode}`,
        message: response,
      };
    }

    const payload = response as HttpExceptionPayload;

    return {
      code:
        payload.code ??
        this.toErrorCode(payload.error) ??
        `HTTP_${statusCode}`,
      message: this.normalizeMessage(
        payload.message,
        exception.message,
      ),
      ...(payload.fields ? { fields: payload.fields } : {}),
      ...(payload.details !== undefined
        ? { details: payload.details }
        : {}),
    };
  }

  private normalizeMessage(
    message: string | string[] | undefined,
    fallback: string,
  ): string {
    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    if (Array.isArray(message)) {
      const first = message.find(
        (item) => typeof item === 'string' && item.trim(),
      );
      if (first) {
        return first;
      }
    }

    return fallback;
  }

  private toErrorCode(
    value: string | undefined,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
