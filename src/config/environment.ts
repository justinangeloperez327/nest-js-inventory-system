const NODE_ENVIRONMENTS = new Set(['development', 'test', 'production']);

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = String(config.NODE_ENV ?? 'development');
  if (!NODE_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error(
      `NODE_ENV must be one of: ${Array.from(NODE_ENVIRONMENTS).join(', ')}`,
    );
  }

  const port = Number(config.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const apiPrefix = String(config.API_PREFIX ?? 'api/v1')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!apiPrefix) {
    throw new Error('API_PREFIX cannot be empty');
  }

  const corsOrigins = String(
    config.CORS_ORIGINS ?? 'http://localhost:4200',
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin');
  }

  const databaseUrl = String(config.DATABASE_URL ?? '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (!['postgresql:', 'postgres:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use the postgresql:// or postgres:// protocol');
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    API_PREFIX: apiPrefix,
    CORS_ORIGINS: corsOrigins.join(','),
    DATABASE_URL: databaseUrl,
  };
}
