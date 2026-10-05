export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  jti: string;
  iat?: number;
  exp?: number;
}
