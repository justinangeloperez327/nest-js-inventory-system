const NODE_ENVIRONMENTS = new Set([
  'development',
  'test',
  'production',
]);

function requiredSecret(
  config: Record<string, unknown>,
  key: string,
): string {
  const value = String(config[key] ?? '').trim();

  if (value.length < 32) {
    throw new Error(
      `${key} must be at least 32 characters long`,
    );
  }

  return value;
}

function integerInRange(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(config[key] ?? fallback);

  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `${key} must be an integer between ${min} and ${max}`,
    );
  }

  return value;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = String(
    config.NODE_ENV ?? 'development',
  );
  if (!NODE_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error(
      `NODE_ENV must be one of: ${Array.from(
        NODE_ENVIRONMENTS,
      ).join(', ')}`,
    );
  }

  const port = Number(config.PORT ?? 3000);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      'PORT must be an integer between 1 and 65535',
    );
  }

  const apiPrefix = String(
    config.API_PREFIX ?? 'api/v1',
  )
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
    throw new Error(
      'CORS_ORIGINS must contain at least one origin',
    );
  }

  const currencyCode = String(
    config.CURRENCY_CODE ?? 'AED',
  )
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error(
      'CURRENCY_CODE must be a three-letter currency code',
    );
  }

  const databaseUrl = String(
    config.DATABASE_URL ?? '',
  ).trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL must be a valid PostgreSQL connection URL',
    );
  }

  if (
    !['postgresql:', 'postgres:'].includes(
      parsedDatabaseUrl.protocol,
    )
  ) {
    throw new Error(
      'DATABASE_URL must use the postgresql:// or postgres:// protocol',
    );
  }

  const accessSecret = requiredSecret(
    config,
    'JWT_ACCESS_SECRET',
  );
  const refreshSecret = requiredSecret(
    config,
    'JWT_REFRESH_SECRET',
  );

  if (accessSecret === refreshSecret) {
    throw new Error(
      'JWT access and refresh secrets must be different',
    );
  }

  const accessTtlSeconds = integerInRange(
    config,
    'JWT_ACCESS_TTL_SECONDS',
    900,
    60,
    86400,
  );
  const refreshTtlSeconds = integerInRange(
    config,
    'JWT_REFRESH_TTL_SECONDS',
    604800,
    3600,
    7776000,
  );

  const jwtIssuer = String(
    config.JWT_ISSUER ?? 'nest-js-inventory-system',
  ).trim();
  const jwtAudience = String(
    config.JWT_AUDIENCE ?? 'angular-inventory-system',
  ).trim();

  if (!jwtIssuer) {
    throw new Error('JWT_ISSUER cannot be empty');
  }

  if (!jwtAudience) {
    throw new Error('JWT_AUDIENCE cannot be empty');
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    API_PREFIX: apiPrefix,
    CORS_ORIGINS: corsOrigins.join(','),
    CURRENCY_CODE: currencyCode,
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_TTL_SECONDS: accessTtlSeconds,
    JWT_REFRESH_TTL_SECONDS: refreshTtlSeconds,
    JWT_ISSUER: jwtIssuer,
    JWT_AUDIENCE: jwtAudience,
  };
}
