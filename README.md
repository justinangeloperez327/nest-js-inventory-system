# NestJS Inventory System

REST backend for the Angular Inventory System.

## Requirements

- Node.js 24 LTS or newer
- npm 11 or newer

## Setup

```bash
cp .env.example .env
npm install
npm run start:dev
```

The API starts at:

```text
http://localhost:3000/api/v1
```

Health check:

```text
GET /api/v1/health
```

Response:

```json
{
  "status": "ok"
}
```

## Group 1 foundation

The application currently includes:

- environment-aware configuration
- `/api/v1` global API prefix
- Angular development CORS configuration
- global validation with DTO whitelisting
- global HTTP exception handling
- request IDs via `X-Request-Id`
- structured HTTP request logging
- graceful shutdown hooks
- health endpoint
- Node 24 / ESM production startup

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

## Stack

- NestJS 12
- TypeScript
- Express
- OXLint
- Prettier

PostgreSQL and Prisma are intentionally deferred to Group 2.
