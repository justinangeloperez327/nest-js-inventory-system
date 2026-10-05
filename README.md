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

The default API prefix is:

```text
/api/v1
```

The Angular application should therefore use `/api/v1` as its API base URL when the frontend and backend are connected directly.

## Angular API contract

Successful resource endpoints return the resource body directly.

Paginated endpoints return:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

List APIs accept `direction=asc|desc`. The earlier `order` parameter remains supported as a backend-compatible alias.

Errors follow the Angular HTTP normalizer contract:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "The request contains invalid data.",
  "statusCode": 400,
  "path": "/api/v1/products",
  "traceId": "...",
  "timestamp": "...",
  "errors": {
    "sku": ["SKU must be unique."]
  }
}
```

## Authentication

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Login returns the access token and current user directly. The response also includes refresh-token data for future refresh support.

Logout is authenticated by the access token, accepts the Angular client's empty request body, revokes active refresh tokens for that user, and returns HTTP 204.

There is no public registration endpoint.

## RBAC

Backend permission values use the same canonical permission strings as the Angular application:

```text
dashboard.view

product.view
product.create
product.update
product.delete

master-data.view
master-data.manage

supplier.view
supplier.manage

inventory.view
inventory.adjust
inventory.transfer
inventory.count

purchase.view
purchase.create
purchase.approve
purchase.receive

sales.view
sales.create

reports.view
user.manage
settings.manage
```

After updating an existing seeded database to this version, run:

```bash
npm run db:seed
```

to synchronize system-role permission assignments.

## Products

Product Master is intentionally separate from stock balances. Products contain master data; warehouse quantities are implemented by the inventory domain.

Endpoints:

```text
GET   /api/v1/products
GET   /api/v1/products/form-options
GET   /api/v1/products/:id
POST  /api/v1/products
PUT   /api/v1/products/:id
PATCH /api/v1/products/:id/status
```

The list endpoint supports:

```text
page
pageSize
search
sort
direction
categoryId
unitId
active
```

Search matches SKU, barcode, and name.

Supported sort fields:

```text
name
sku
costPrice
sellingPrice
reorderLevel
createdAt
updatedAt
```

The Product API contract matches the Angular models:

```json
{
  "id": "...",
  "sku": "SKU-001",
  "barcode": "123456789",
  "name": "Product",
  "categoryId": "...",
  "categoryName": "Category",
  "unitId": "...",
  "unitName": "Piece",
  "costPrice": 10,
  "sellingPrice": 12.5,
  "reorderLevel": 5,
  "active": true,
  "currencyCode": "AED",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Category and unit are optional for Product Master, matching the Angular form. When assigned or changed, the selected master-data record must be active. An existing product may retain a category or unit that is later deactivated.

SKU values are normalized to uppercase and checked case-insensitively for uniqueness. Barcode values are optional and unique when supplied.

Prices and reorder levels must be non-negative and support up to four decimal places.

Products are activated/deactivated rather than hard-deleted.

Status permissions match Angular behavior:

- `product.update` — edit and reactivate
- `product.delete` — deactivate

### Product form options

`GET /api/v1/products/form-options` returns active categories, active units, and the configured currency code:

```json
{
  "categories": [],
  "units": [],
  "currencyCode": "AED"
}
```

Set `CURRENCY_CODE` in the environment to change the three-letter currency code.

## Categories and units

Categories and units remain protected by:

- `master-data.view` for reads
- `master-data.manage` for mutations

Existing master-data endpoints remain available from Group 6.

## Users and access control

User, role, and permission administration is protected by `user.manage`.

The seed provides these system roles:

- Administrator
- Inventory Manager
- Warehouse Staff
- Purchasing
- Sales
- Viewer

Set the optional `BOOTSTRAP_ADMIN_*` values before `npm run db:seed` to create the first Administrator.

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

## Environment

See `.env.example`.

Important application settings include:

```text
API_PREFIX=api/v1
CORS_ORIGINS=http://localhost:4200
CURRENCY_CODE=AED
```

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
