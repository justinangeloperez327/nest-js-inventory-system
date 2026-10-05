import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { PaginatedResult } from '../interfaces/pagination.interface.js';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (value instanceof StreamableFile) {
          return value;
        }

        if (value instanceof PaginatedResult) {
          return value;
        }

        return {
          data: value,
        };
      }),
    );
  }
}
