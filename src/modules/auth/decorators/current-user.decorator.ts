import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthRequest } from '../interfaces/auth-request.interface.js';
import type { AuthUser } from '../interfaces/auth-user.interface.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    return request.user;
  },
);
