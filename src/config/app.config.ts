import { registerAs } from '@nestjs/config';

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  return !['0', 'false', 'no', 'off'].includes(
    value.trim().toLowerCase(),
  );
}

function normalizeRelativePath(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = (value ?? fallback)
    .trim()
    .replace(/^\/+|\/+$/g, '');

  return normalized || fallback;
}

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'NestJS Inventory System',
  environment: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  currencyCode: (process.env.CURRENCY_CODE ?? 'AED').toUpperCase(),
  openApiEnabled: parseBoolean(process.env.OPENAPI_ENABLED, true),
  openApiPath: normalizeRelativePath(
    process.env.OPENAPI_PATH,
    'docs',
  ),
  openApiVersion:
    process.env.OPENAPI_VERSION?.trim() || '1.0.0',
}));
