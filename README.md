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

## Master data

Categories, units, and warehouses use the same contract as the Angular Master Data feature.

### Categories

```text
GET   /api/v1/categories
GET   /api/v1/categories/:id
POST  /api/v1/categories
PUT   /api/v1/categories/:id
PATCH /api/v1/categories/:id/status
```

Fields:

```text
code
name
description
active
createdAt
updatedAt
```

### Units

```text
GET   /api/v1/units
GET   /api/v1/units/:id
POST  /api/v1/units
PUT   /api/v1/units/:id
PATCH /api/v1/units/:id/status
```

Fields:

```text
code
name
symbol
active
createdAt
updatedAt
```

### Warehouses

```text
GET   /api/v1/warehouses
GET   /api/v1/warehouses/:id
POST  /api/v1/warehouses
PUT   /api/v1/warehouses/:id
PATCH /api/v1/warehouses/:id/status
```

Fields:

```text
code
name
location
active
createdAt
updatedAt
```

All three list endpoints support `page`, `pageSize`, `search`, `sort`, `direction`, and `active`.

Master-data codes are normalized to uppercase. Category and unit codes are unique, and warehouse codes are unique.

Master data is activated/deactivated rather than hard-deleted by the normal API. A warehouse cannot be deactivated while it has non-zero on-hand or reserved inventory.

All master-data reads require `master-data.view`. Mutations require `master-data.manage`.

## Inventory core

Inventory is modeled per product and warehouse. Product Master does not contain a mutable global quantity.

```text
InventoryItem
productId
warehouseId
quantityOnHand
quantityReserved
quantityAvailable = quantityOnHand - quantityReserved
averageCost
```

Group 9 intentionally exposes inventory as read-only. There are no ordinary POST, PUT, PATCH, or DELETE endpoints for changing quantities. Stock mutation is reserved for controlled inventory transactions beginning with the stock movement ledger.

Endpoints:

```text
GET /api/v1/inventory/balances
GET /api/v1/inventory/form-options
GET /api/v1/inventory/products/:productId
GET /api/v1/inventory/warehouses/:warehouseId
```

All endpoints require `inventory.view`.

### Balance list

`GET /api/v1/inventory/balances` supports:

```text
page
pageSize
search
sort
direction
productId
warehouseId
status
```

Search matches product SKU, product name, barcode, warehouse code, and warehouse name.

Supported status values:

```text
in-stock
low-stock
out-of-stock
```

Status uses available quantity, not raw on-hand quantity:

```text
available = onHand - reserved

available <= 0
  -> out-of-stock

available > 0 and available <= reorderLevel
  -> low-stock

available > reorderLevel
  -> in-stock
```

The balance response matches the Angular inventory contract:

```json
{
  "id": "...",
  "productId": "...",
  "sku": "SKU-001",
  "productName": "Product",
  "unitName": "Piece",
  "unitSymbol": "pc",
  "warehouseId": "...",
  "warehouseCode": "WH-001",
  "warehouseName": "Main Warehouse",
  "quantityOnHand": 100,
  "quantityReserved": 15,
  "quantityAvailable": 85,
  "reorderLevel": 20,
  "status": "in-stock",
  "updatedAt": "..."
}
```

Supported balance sort fields:

```text
productName
sku
warehouseName
warehouseCode
quantityOnHand
quantityReserved
quantityAvailable
reorderLevel
updatedAt
```

### Inventory snapshots

Product inventory returns the Product header, totals across warehouses, and paginated warehouse balances.

Warehouse inventory returns the Warehouse header, totals across products, and paginated product balances.

Totals include:

```text
quantityOnHand
quantityReserved
quantityAvailable
lowStockLines
outOfStockLines
```

`GET /api/v1/inventory/form-options` returns active warehouses for Angular inventory filtering.

## Stock movement ledger

Stock movements are the immutable audit trail behind inventory balances.

The Angular-facing ledger is read-only:

```text
GET /api/v1/stock-movements
GET /api/v1/stock-movements/form-options
GET /api/v1/stock-movements/:id
```

All three endpoints require `inventory.view`.

There are deliberately no public create, update, or delete endpoints for stock movements. New movements are created only by authorized business operations through the exported `StockMovementsService.applyMovement()` transaction boundary.

### Movement types

```text
receipt
sale
transfer-in
transfer-out
adjustment-in
adjustment-out
return-in
return-out
stock-count
```

`quantityChange` is signed:

- positive values increase on-hand stock
- negative values decrease on-hand stock
- zero is allowed for an auditable event
- movement direction must match its type, except `stock-count`, which may be positive, negative, or zero

### Atomic stock mutation

Every movement is applied in one database transaction:

```text
validate command
      ↓
ensure product + warehouse balance row
      ↓
lock balance row FOR UPDATE
      ↓
read inventory.allowNegativeStock
      ↓
validate resulting available stock
      ↓
update on-hand quantity / weighted average cost
      ↓
insert immutable stock movement
      ↓
commit
```

When negative stock is disabled, an outbound movement is rejected if:

```text
newOnHand - quantityReserved < 0
```

with:

```text
INSUFFICIENT_AVAILABLE_STOCK
```

This means reserved quantity is protected and cannot be consumed by an unrelated outbound movement.

For positive movements with a supplied `unitCost`, the inventory row recalculates weighted average cost transactionally.

### Ledger fields

Movement rows store:

```text
productId
warehouseId
type
quantityChange
unitCost
balanceBefore
balanceAfter
referenceType
referenceId
referenceNumber
referencePath
notes
occurredAt
performedByUserId
createdAt
```

`balanceBefore` and `balanceAfter` represent on-hand quantity.

Source references are optional, but when present they contain type, id, and display number. `referencePath` is optional and must be a safe local path beginning with exactly one `/`.

### Movement queries

The list endpoint supports:

```text
page
pageSize
search
sort
direction
productId
warehouseId
type
dateFrom
dateTo
reference
```

Search matches product SKU/name and warehouse code/name.

Supported sorts:

```text
occurredAt
productName
sku
warehouseName
type
quantityChange
balanceAfter
```

The default sort is `occurredAt desc`.

The response matches the Angular stock movement model:

```json
{
  "id": "...",
  "productId": "...",
  "sku": "SKU-001",
  "productName": "Product",
  "unitSymbol": "pc",
  "warehouseId": "...",
  "warehouseCode": "WH-001",
  "warehouseName": "Main Warehouse",
  "type": "receipt",
  "quantityChange": 10,
  "balanceAfter": 25,
  "reference": {
    "type": "purchase-receipt",
    "id": "...",
    "number": "GRN-001"
  },
  "occurredAt": "...",
  "performedBy": {
    "id": "...",
    "name": "System Administrator"
  }
}
```

### Immutability

PostgreSQL rejects `UPDATE` and `DELETE` against `stock_movements` through a database trigger. Product, warehouse, and actor foreign keys are restricted so historical attribution cannot be silently rewritten through cascades.

Corrections must be represented by a new compensating movement.

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
