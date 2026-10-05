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

## Inventory adjustments

Inventory adjustments are controlled business transactions. They never write inventory balances directly.

Endpoints:

```text
GET  /api/v1/inventory-adjustments
GET  /api/v1/inventory-adjustments/form-options
GET  /api/v1/inventory-adjustments/product-options?search=...
GET  /api/v1/inventory-adjustments/:id
POST /api/v1/inventory-adjustments
PUT  /api/v1/inventory-adjustments/:id
POST /api/v1/inventory-adjustments/:id/post
```

Read-only list/detail/form-options require `inventory.view`.

Product lookup, create, update, and post require `inventory.adjust`.

### Draft workflow

Create and update save a draft. Draft fields are:

```text
productId
warehouseId
direction
quantity
reasonCode
notes
```

Directions:

```text
increase
decrease
```

Quantity is always entered as a positive value with up to four decimal places. The direction determines whether posting creates an `adjustment-in` or `adjustment-out` movement.

The backend controls the available reason catalog. Current reason codes are:

```text
manual-correction
data-correction
found-stock       (increase only)
damage            (decrease only)
expired           (decrease only)
shrinkage         (decrease only)
```

The form-options endpoint returns active warehouses and the reason catalog. Product search returns at most 20 active, trackable products and searches SKU, name, and barcode.

### Posting

Posting is separate from draft editing and is concurrency-safe.

```text
lock adjustment FOR UPDATE
        ↓
confirm status = draft
        ↓
revalidate reason
        ↓
revalidate active/trackable product
        ↓
revalidate active warehouse
        ↓
apply stock movement in the same transaction
        ↓
store movement ID + before/after balance
        ↓
mark adjustment posted
        ↓
commit
```

An increase creates:

```text
adjustment-in
```

A decrease creates:

```text
adjustment-out
```

The movement reference uses the adjustment number and local route `/adjustments/:id`.

Decrease posting inherits the ledger's negative-stock protection. If available stock would become negative while `inventory.allowNegativeStock` is false, the whole posting transaction is rolled back.

### Immutability

Posted adjustments are immutable.

PostgreSQL also protects the workflow directly:

- inventory adjustments cannot be deleted
- posted or cancelled adjustments cannot be updated
- posting cannot alter the draft product, warehouse, direction, quantity, reason, or notes
- adjustment identity fields remain immutable

Corrections to a posted adjustment require a new adjustment, preserving the stock ledger.

### List queries

The list endpoint supports:

```text
page
pageSize
search
sort
direction
warehouseId
direction
status
dateFrom
dateTo
```

Status values are:

```text
draft
posted
cancelled
```

The current public API does not expose a cancel command yet; `cancelled` is reserved in the persisted workflow for a future controlled cancellation command.

Default Angular sorting is `createdAt desc`.

## Inventory transfers

Inventory transfers move stock between two warehouses as one atomic business transaction.

Endpoints:

```text
GET  /api/v1/inventory-transfers
GET  /api/v1/inventory-transfers/form-options
GET  /api/v1/inventory-transfers/product-options?sourceWarehouseId=...&search=...
GET  /api/v1/inventory-transfers/:id
POST /api/v1/inventory-transfers
PUT  /api/v1/inventory-transfers/:id
POST /api/v1/inventory-transfers/:id/post
```

List, detail, and form-options require `inventory.view`. Product lookup, create, update, and post require `inventory.transfer`.

### Draft structure

A transfer contains:

```text
sourceWarehouseId
destinationWarehouseId
notes
lines[]
  productId
  quantity
```

Rules:

- source and destination must be different active warehouses
- at least one line is required
- a transfer supports at most 200 lines
- each product can appear only once
- quantities must be positive with up to four decimal places
- products must be active and trackable
- each selected product must have an inventory balance in the source warehouse

Product lookup is server-backed, scoped to the selected source warehouse, searches SKU/name/barcode, and returns the current `quantityAvailable` for operator context.

### Posting

Displayed product availability is advisory. Posting re-reads inventory under database locks.

```text
lock transfer FOR UPDATE
        ↓
revalidate draft + warehouses + products + quantities
        ↓
acquire deterministic advisory locks for all product/warehouse pairs
        ↓
lock source and destination balances
        ↓
verify source available quantity for every line
        ↓
for each line:
  transfer-out at source
  transfer-in at destination
        ↓
store both movement IDs and before/after balances
        ↓
mark transfer posted
        ↓
commit
```

Every transfer line creates exactly two immutable stock movements referencing the same transfer:

```text
transfer-out
transfer-in
```

The inbound movement carries the source warehouse's current average cost so destination weighted-average valuation remains consistent.

Transfers enforce sufficient source available stock even when the general `inventory.allowNegativeStock` setting is enabled. Moving stock that is not available at the source is not a valid warehouse transfer.

If any line fails, the entire transaction rolls back.

### Posted detail audit

Each posted line can expose:

```text
sourceBalanceBefore
sourceBalanceAfter
destinationBalanceBefore
destinationBalanceAfter
outboundMovement.id
inboundMovement.id
```

The transfer also preserves creator/poster attribution and timestamps.

### Immutability

Posted or cancelled transfers are immutable and transfers cannot be deleted.

Database triggers also protect transfer headers and lines. Posting cannot change the draft route, notes, product IDs, or quantities.

A correction must be represented by another authorized inventory transaction.

### List queries

The list endpoint supports:

```text
page
pageSize
search
sort
direction
sourceWarehouseId
destinationWarehouseId
status
dateFrom
dateTo
```

Search covers transfer number, source/destination warehouse code/name, and product SKU/name.

Status values:

```text
draft
posted
cancelled
```

The public API does not expose a cancellation command yet; `cancelled` remains reserved for a future controlled workflow.

## Suppliers

Suppliers are purchasing master data. Purchase orders and receipts remain separate transactional domains.

Endpoints:

```text
GET   /api/v1/suppliers
GET   /api/v1/suppliers/:id
POST  /api/v1/suppliers
PUT   /api/v1/suppliers/:id
PATCH /api/v1/suppliers/:id/status
GET   /api/v1/suppliers/:id/purchase-history
```

Supplier list/detail require `supplier.view`. Create, update, activate, and deactivate require `supplier.manage`.

Purchase history requires both `supplier.view` and `purchase.view`.

### Supplier fields

```text
code
name
contactName
email
phone
taxNumber
addressLine1
addressLine2
city
stateProvince
postalCode
countryCode
active
createdAt
updatedAt
```

Validation and normalization rules:

- code is required, uppercased, max 50 characters, and unique
- name is required, max 200 characters
- contact name max 150 characters
- email is normalized to lowercase and validated
- phone max 50 characters
- tax number is normalized to uppercase and unique when supplied
- address lines max 250 characters
- city/state max 100 characters
- postal code max 30 characters
- country code is optional and must be a two-letter uppercase code

Supplier search covers code, name, contact name, email, and phone.

The list supports:

```text
page
pageSize
search
sort
direction
active
```

Supported sorts:

```text
name
code
contactName
email
countryCode
updatedAt
createdAt
```

Suppliers use activation/deactivation rather than normal hard deletion. Group 14 must reject creation of new purchase orders for inactive suppliers while retaining historical supplier references.

### Purchase history compatibility

Until Group 14 introduces the Purchase Order persistence model, `GET /suppliers/:id/purchase-history` returns a valid empty paginated response with the configured currency code.

That preserves the Angular supplier profile contract without prematurely creating purchase-order tables in Supplier Management.

Group 14 will replace the empty history implementation with actual purchase-order data while keeping the same response contract.

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
