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

## First administrator

There is no public registration endpoint.

To create the first administrator, set these values in `.env` before running the seed:

```text
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-strong-password
BOOTSTRAP_ADMIN_FIRST_NAME=System
BOOTSTRAP_ADMIN_LAST_NAME=Administrator
```

Then run:

```bash
npm run db:seed
```

The seed is idempotent. It creates the permission catalog and system roles, and only creates the bootstrap user if that email does not already exist. An existing matching user is granted the Administrator role without replacing their password.

## Authentication

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

The backend uses 15-minute access JWTs and 7-day rotating refresh JWTs by default. Refresh-token proofs are stored as Argon2id hashes.

Protected requests send:

```text
Authorization: Bearer <access-token>
```

## RBAC

Authorization is permission-based. Roles are collections of permissions.

Seeded system roles:

- Administrator
- Inventory Manager
- Warehouse Staff
- Purchasing
- Sales
- Viewer

System roles are application-managed and immutable through the API. Custom roles can be created and assigned any permissions from the catalog.

Permission changes take effect on the next request because authenticated user permissions are loaded from the database by the access-token guard.

### User management

```text
GET   /api/v1/users
GET   /api/v1/users/:id
POST  /api/v1/users
PATCH /api/v1/users/:id
PATCH /api/v1/users/:id/status
PUT   /api/v1/users/:id/roles
PUT   /api/v1/users/:id/password
```

User passwords require at least 12 characters. Deactivating a user or resetting their password revokes all active refresh tokens.

### Role and permission management

```text
GET    /api/v1/roles
GET    /api/v1/roles/:id
POST   /api/v1/roles
PATCH  /api/v1/roles/:id
PUT    /api/v1/roles/:id/permissions
DELETE /api/v1/roles/:id
GET    /api/v1/permissions
```

Permissions themselves are read-only runtime data. They are defined by the application so permission names do not drift away from the code that enforces them.

## API contract

Successful single-resource responses use `{ "data": ... }`. Paginated collections use:

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

The default page size is `25`, maximum page size is `100`, and standard list queries support `page`, `pageSize`, `search`, `sort`, and `order`.

## Health

```text
GET /api/v1/health
GET /api/v1/health/ready
```

The readiness endpoint verifies PostgreSQL connectivity.

## Database commands

```bash
npm run db:generate
npm run db:migrate
npm run db:migrate:deploy
npm run db:seed
npm run db:studio
npm run db:reset
```

Generated Prisma Client code lives under `src/generated/prisma` and is regenerated during `npm install`.

## Environment

See `.env.example`.

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
