import { registerAs } from '@nestjs/config';

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'NestJS Inventory System',
  environment: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  currencyCode: (process.env.CURRENCY_CODE ?? 'AED').toUpperCase(),
}));
