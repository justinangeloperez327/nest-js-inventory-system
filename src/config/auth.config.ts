import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
  refreshTtlSeconds: Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 604800),
  issuer: process.env.JWT_ISSUER ?? 'nest-js-inventory-system',
  audience: process.env.JWT_AUDIENCE ?? 'angular-inventory-system',
}));
