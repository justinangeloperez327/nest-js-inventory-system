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

There is no public registration endpoint. Set the optional `BOOTSTRAP_ADMIN_*` values in `.env`, then run:

```bash
npm run db:seed
```

The seed creates the permission catalog, system roles, settings, and the optional first Administrator.

## Authentication

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

The backend uses short-lived access JWTs and rotating refresh JWTs.

## RBAC

Authorization is permission-based. Seeded roles are Administrator, Inventory Manager, Warehouse Staff, Purchasing, Sales, and Viewer.

System roles are application-managed. Custom roles can be managed through:

```text
GET    /api/v1/roles
GET    /api/v1/roles/:id
POST   /api/v1/roles
PATCH  /api/v1/roles/:id
PUT    /api/v1/roles/:id/permissions
DELETE /api/v1/roles/:id
GET    /api/v1/permissions
```

## Users

```text
GET   /api/v1/users
GET   /api/v1/users/:id
POST  /api/v1/users
PATCH /api/v1/users/:id
PATCH /api/v1/users/:id/status
PUT   /api/v1/users/:id/roles
PUT   /api/v1/users/:id/password
```

## Categories

```text
GET    /api/v1/categories
GET    /api/v1/categories/:id
POST   /api/v1/categories
PATCH  /api/v1/categories/:id
PATCH  /api/v1/categories/:id/status
DELETE /api/v1/categories/:id
```

Category lists support pagination, search, status filtering, and sorting by `name`, `createdAt`, or `updatedAt`.

Category names are checked case-insensitively for duplicates. A category referenced by products cannot be deleted; deactivate it instead.

Category responses include `productCount`.

## Units

```text
GET    /api/v1/units
GET    /api/v1/units/:id
POST   /api/v1/units
PATCH  /api/v1/units/:id
PATCH  /api/v1/units/:id/status
DELETE /api/v1/units/:id
```

Unit lists support pagination, search, status filtering, and sorting by `name`, `symbol`, `createdAt`, or `updatedAt`.

Unit names and symbols are checked case-insensitively for duplicates. A unit referenced by products cannot be deleted; deactivate it instead.

Unit responses include `productCount`.

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

The default page size is `25` and the maximum page size is `100`.

## Health

```text
GET /api/v1/health
GET /api/v1/health/ready
```

## Database commands

```bash
npm run db:generate
npm run db:migrate
npm run db:migrate:deploy
npm run db:seed
npm run db:studio
npm run db:reset
```

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
