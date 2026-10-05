import type { AuthUser } from './auth-user.interface.js';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  expiresAt: string;
  user: AuthUser;
}
