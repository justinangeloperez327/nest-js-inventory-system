# NestJS Inventory System

REST backend for the Angular Inventory System.

## Requirements

- Node.js 24 LTS or newer
- npm 11 or newer
- PostgreSQL 18

## Setup

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate:deploy
npm run db:seed
npm run start:dev
```

The API starts at:

```text
http://localhost:3000/api/v1
```

## API contract

Successful single-resource responses use a consistent envelope:

```json
{
  "data": {
    "id": "..."
  }
}
```

Paginated collections use:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0
  }
}
```

The default page size is `25` and the maximum accepted page size is `100`.

Standard list queries support:

```text
?page=1&pageSize=25&search=laptop&sort=name&order=asc
```

Feature modules extend the common list DTO with their own validated filters.

Validation failures are field-addressable:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data.",
    "statusCode": 400,
    "path": "/api/v1/products",
    "requestId": "...",
    "timestamp": "...",
    "fields": {
      "name": ["name should not be empty"]
    }
  }
}
```

All error responses include a stable error code, HTTP status, request ID, request path, and timestamp.

## Health

Liveness:

```text
GET /api/v1/health
```

Response:

```json
{
  "data": {
    "status": "ok"
  }
}
```

Readiness, including PostgreSQL connectivity:

```text
GET /api/v1/health/ready
```

Successful readiness response:

```json
{
  "data": {
    "status": "ok",
    "database": "up"
  }
}
```

## Database

The project uses Prisma ORM with PostgreSQL.

The initial database foundation includes:

- users
- roles
- permissions
- user-role assignments
- role-permission assignments
- categories
- units
- products
- warehouses
- per-warehouse inventory balances
- system settings
- audit logs

Inventory quantities use decimal values so the model can support both discrete items and measured units.

### Database commands

```bash
npm run db:generate
npm run db:migrate
npm run db:migrate:deploy
npm run db:seed
npm run db:studio
npm run db:reset
```

Use `db:migrate` when developing schema changes. Use `db:migrate:deploy` in deployed environments.

Generated Prisma Client code lives under `src/generated/prisma` and is regenerated during `npm install`.

## Foundation

The application includes:

- environment-aware configuration
- `/api/v1` global API prefix
- Angular development CORS configuration
- global DTO validation and transformation
- standardized success and error responses
- reusable pagination/list query DTOs and pagination helpers
- request IDs via `X-Request-Id`
- structured HTTP request logging
- graceful shutdown hooks
- liveness and database-readiness endpoints
- PostgreSQL/Prisma database module
- migration and seed infrastructure

## Environment

See `.env.example`.

`CORS_ORIGINS` accepts a comma-separated list when multiple Angular origins are required.

## Scripts

```bash
npm run build
npm run start
npm run start:dev
npm run start:debug
npm run start:prod
npm run lint
npm run format
npm run check
```
