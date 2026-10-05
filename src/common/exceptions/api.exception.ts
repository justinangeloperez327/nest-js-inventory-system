import { HttpException } from '@nestjs/common';

export interface ApiExceptionOptions {
  code: string;
  statusCode: number;
  message: string;
  fields?: Record<string, string[]>;
  details?: unknown;
}

export class ApiException extends HttpException {
  constructor(options: ApiExceptionOptions) {
    super(
      {
        code: options.code,
        message: options.message,
        ...(options.fields ? { fields: options.fields } : {}),
        ...(options.details !== undefined ? { details: options.details } : {}),
      },
      options.statusCode,
    );
  }
}
