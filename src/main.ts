import {
  BadRequestException,
  Logger,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { ValidationError } from 'class-validator';

import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { requestContextMiddleware } from './common/middleware/request-context.middleware.js';
import { validationErrorsToFields } from './common/utils/validation-errors.util.js';
import { setupOpenApi } from './openapi/openapi.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const appName =
    config.get<string>('app.name') ?? 'NestJS Inventory System';
  const host = config.get<string>('app.host') ?? '0.0.0.0';
  const port = config.get<number>('app.port') ?? 3000;
  const apiPrefix =
    config.get<string>('app.apiPrefix') ?? 'api/v1';
  const corsOrigins =
    config.get<string[]>('app.corsOrigins') ?? [
      'http://localhost:4200',
    ];
  const openApiEnabled =
    config.get<boolean>('app.openApiEnabled') ?? true;
  const openApiPath =
    config.get<string>('app.openApiPath') ?? 'docs';
  const openApiVersion =
    config.get<string>('app.openApiVersion') ?? '1.0.0';

  app.use(requestContextMiddleware);
  app.setGlobalPrefix(apiPrefix, {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'The request contains invalid data.',
          fields: validationErrorsToFields(errors),
        }),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  if (openApiEnabled) {
    setupOpenApi(app, {
      appName,
      apiPrefix,
      path: openApiPath,
      version: openApiVersion,
    });
  }

  await app.listen(port, host);

  Logger.log(
    `${appName} listening on http://${host}:${port}/${apiPrefix}`,
    'Bootstrap',
  );

  if (openApiEnabled) {
    Logger.log(
      `OpenAPI documentation available at http://${host}:${port}/${apiPrefix}/${openApiPath}`,
      'Bootstrap',
    );
  }
}

await bootstrap();
