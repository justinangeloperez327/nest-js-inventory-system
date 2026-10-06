import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

interface OpenApiSetupOptions {
  appName: string;
  apiPrefix: string;
  path: string;
  version: string;
}

interface MutableOperation {
  operationId?: string;
  summary?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  security?: Array<Record<string, string[]>>;
  responses?: Record<string, unknown>;
}

function errorResponse(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ApiErrorResponse',
        },
      },
    },
  };
}

function operationSummary(operationId: string): string {
  const methodName =
    operationId.split('_').slice(1).join('_') || operationId;

  return methodName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (value) => value.toUpperCase());
}

function normalizePrefix(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

function isPublicPath(path: string, apiPrefix: string): boolean {
  const publicPaths = [
    '/auth/login',
    '/auth/refresh',
    '/health',
    '/health/ready',
  ];
  const prefix = normalizePrefix(apiPrefix);

  return publicPaths.some(
    (publicPath) =>
      path === publicPath ||
      path === `/${prefix}${publicPath}`,
  );
}

function isAuthenticationOnlyPath(
  path: string,
  apiPrefix: string,
): boolean {
  const authenticationOnlyPaths = ['/auth/logout', '/auth/me'];
  const prefix = normalizePrefix(apiPrefix);

  return authenticationOnlyPaths.some(
    (authPath) =>
      path === authPath || path === `/${prefix}${authPath}`,
  );
}

function enrichDocument(
  document: OpenAPIObject,
  apiPrefix: string,
): void {
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      ApiErrorResponse: {
        type: 'object',
        required: [
          'code',
          'message',
          'statusCode',
          'path',
          'traceId',
          'timestamp',
        ],
        properties: {
          code: {
            type: 'string',
            example: 'VALIDATION_ERROR',
          },
          message: {
            type: 'string',
            example: 'The request contains invalid data.',
          },
          statusCode: {
            type: 'integer',
            format: 'int32',
            example: 400,
          },
          path: {
            type: 'string',
            example: '/api/v1/products',
          },
          traceId: {
            type: 'string',
            description:
              'Request correlation identifier. It is also returned in the X-Request-Id response header.',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          errors: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            description:
              'Field-level validation errors when the failure is caused by request validation.',
          },
          details: {
            description:
              'Optional structured error details for domain-specific failures.',
          },
        },
      },
      PaginationMeta: {
        type: 'object',
        required: [
          'page',
          'pageSize',
          'totalItems',
          'totalPages',
        ],
        properties: {
          page: {
            type: 'integer',
            minimum: 1,
          },
          pageSize: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
          },
          totalItems: {
            type: 'integer',
            minimum: 0,
          },
          totalPages: {
            type: 'integer',
            minimum: 0,
          },
        },
      },
    },
    responses: {
      ...document.components?.responses,
      BadRequest: errorResponse(
        'The request is invalid or failed validation.',
      ),
      Unauthorized: errorResponse(
        'Authentication is required or the access token is invalid or expired.',
      ),
      Forbidden: errorResponse(
        'The authenticated user does not have the required permission.',
      ),
      NotFound: errorResponse(
        'The requested resource was not found.',
      ),
      Conflict: errorResponse(
        'The request conflicts with the current resource or workflow state.',
      ),
      InternalServerError: errorResponse(
        'An unexpected server error occurred.',
      ),
      ServiceUnavailable: errorResponse(
        'A required service such as the database is unavailable.',
      ),
    },
  };

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[
        method
      ] as MutableOperation | undefined;

      if (!operation) {
        continue;
      }

      operation.responses ??= {};

      if (
        operation.operationId &&
        !operation.summary
      ) {
        operation.summary = operationSummary(operation.operationId);
      }

      if (
        (operation.parameters?.length ?? 0) > 0 ||
        operation.requestBody
      ) {
        operation.responses['400'] ??= {
          $ref: '#/components/responses/BadRequest',
        };
      }

      if (isPublicPath(path, apiPrefix)) {
        operation.security = [];
      } else {
        operation.responses['401'] ??= {
          $ref: '#/components/responses/Unauthorized',
        };

        if (!isAuthenticationOnlyPath(path, apiPrefix)) {
          operation.responses['403'] ??= {
            $ref: '#/components/responses/Forbidden',
          };
        }
      }

      if (path.includes('{')) {
        operation.responses['404'] ??= {
          $ref: '#/components/responses/NotFound',
        };
      }

      operation.responses['500'] ??= {
        $ref: '#/components/responses/InternalServerError',
      };

      if (
        path.endsWith('/health/ready') ||
        path === '/health/ready'
      ) {
        operation.responses['503'] ??= {
          $ref: '#/components/responses/ServiceUnavailable',
        };
      }
    }
  }
}

export function setupOpenApi(
  app: INestApplication,
  options: OpenApiSetupOptions,
): OpenAPIObject {
  const documentConfig = new DocumentBuilder()
    .setTitle(`${options.appName} API`)
    .setDescription(
      'REST API contract for the Angular Inventory System. Successful resource requests return resource bodies directly; non-2xx responses use the standardized ApiErrorResponse envelope.',
    )
    .setVersion(options.version)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT access token returned by POST /auth/login or POST /auth/refresh.',
      },
      'access-token',
    )
    .addSecurityRequirements('access-token')
    .build();

  const document = SwaggerModule.createDocument(
    app,
    documentConfig,
    {
      deepScanRoutes: true,
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    },
  );

  enrichDocument(document, options.apiPrefix);

  SwaggerModule.setup(options.path, app, document, {
    useGlobalPrefix: true,
    customSiteTitle: `${options.appName} API Documentation`,
    jsonDocumentUrl: `${options.path}/openapi.json`,
    yamlDocumentUrl: `${options.path}/openapi.yaml`,
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      persistAuthorization: true,
    },
  });

  return document;
}
