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

## Health

Liveness:

```text
GET /api/v1/health
```

Readiness, including PostgreSQL connectivity:

```text
GET /api/v1/health/ready
```

Successful readiness response:

```json
{
  "status": "ok",
  "database": "up"
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
- global validation with DTO whitelisting
- global HTTP exception handling
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
