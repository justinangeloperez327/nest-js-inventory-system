import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import type { AuthSession } from './interfaces/auth-session.interface.js';
import type { AuthUser } from './interfaces/auth-user.interface.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthSession> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthSession> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Body() dto: RefreshTokenDto,
  ): Promise<{ loggedOut: true }> {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
