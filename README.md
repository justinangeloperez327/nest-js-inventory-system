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

Replace the example JWT secrets before using the application outside local development.

The API starts at:

```text
http://localhost:3000/api/v1
```

## Authentication

The backend uses short-lived JWT access tokens and rotating JWT refresh tokens.

Default development lifetimes:

- access token: 15 minutes
- refresh token: 7 days

Refresh tokens are persisted only as Argon2id hashes and are revoked when rotated or logged out.

Endpoints:

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Login request:

```json
{
  "email": "user@example.com",
  "password": "your-password"
}
```

Login and refresh responses use the normal API envelope:

```json
{
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "...",
      "email": "user@example.com",
      "firstName": "User",
      "lastName": "Name",
      "roles": [],
      "permissions": []
    }
  }
}
```

Protected requests send:

```text
Authorization: Bearer <access-token>
```

There is deliberately no public registration endpoint. User provisioning and role assignment belong to the user/authorization modules.

## API contract

Successful single-resource responses use:

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

Validation failures are field-addressable and all errors include a stable code, status, request ID, path, and timestamp.

## Health

```text
GET /api/v1/health
GET /api/v1/health/ready
```

The readiness endpoint verifies PostgreSQL connectivity.

## Database

The project uses Prisma ORM with PostgreSQL.

The database foundation includes users, roles, permissions, refresh tokens, categories, units, products, warehouses, per-warehouse inventory balances, system settings, and audit logs.

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
- JWT authentication with rotating refresh tokens

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
