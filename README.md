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

The current currency is managed through Application Settings. `CURRENCY_CODE` remains a bootstrap default for databases whose currency setting has not yet been managed through the Settings API.

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

## Purchase orders

Purchase orders implement the commercial purchasing workflow before physical receiving.

Endpoints:

```text
GET  /api/v1/purchase-orders
GET  /api/v1/purchase-orders/form-options
GET  /api/v1/purchase-orders/supplier-options?search=...
GET  /api/v1/purchase-orders/product-options?search=...
GET  /api/v1/purchase-orders/:id
POST /api/v1/purchase-orders
PUT  /api/v1/purchase-orders/:id
POST /api/v1/purchase-orders/:id/submit
POST /api/v1/purchase-orders/:id/approve
```

Permissions:

- `purchase.view` — list, detail, form options
- `purchase.create` — supplier/product lookup, create, edit, submit
- `purchase.approve` — approve submitted purchase orders
- `purchase.receive` — receive approved purchase orders

### Workflow

```text
draft
  ↓ submit
submitted
  ↓ approve
approved
  ↓ Group 15 receiving
partially-received
  ↓
received
```

Only drafts are commercially editable. Submitted purchase orders lock supplier, warehouse, dates, notes, quantities, prices, and totals.

Cancellation is represented in the status model for future controlled workflow support, but Group 14 does not expose an arbitrary cancel endpoint.

### Purchase-order structure

Header:

```text
number
supplierId
warehouseId
orderDate
expectedDate
notes
status
subtotal
currencyCode
created/submitted/approved audit fields
```

Lines:

```text
productId
quantity
unitPrice
lineTotal
quantityReceived
quantityRemaining
```

A purchase order supports at most 200 unique product lines.

Products must be active and trackable. New and edited purchase orders require an active supplier and active receiving warehouse.

### Lookup strategy

Supplier and product lookup are server-side and limited to 20 results.

Supplier lookup returns active suppliers and searches code, name, and contact name.

Product lookup returns active, trackable products and searches SKU, name, and barcode. `defaultUnitPrice` uses the current Product Master cost price only as operator input assistance; the saved PO line price remains the commercial snapshot.

`GET /purchase-orders/form-options` returns active warehouses plus the configured currency code.

### Totals

The API does not trust client totals.

Quantity and unit price support up to four decimal places. Backend fixed-point arithmetic calculates every line total and the PO subtotal before persistence.

PostgreSQL also validates:

```text
quantity > 0
unitPrice >= 0
lineTotal = round(quantity * unitPrice, 4)
0 <= quantityReceived <= quantity
subtotal >= 0
```

A database trigger synchronizes the draft subtotal from persisted line totals, so direct line changes cannot leave the draft header total inconsistent.

### Submit and approve

Submit and approve both lock the purchase order row with `FOR UPDATE` before checking status.

Submission revalidates:

- status is draft
- supplier remains active
- receiving warehouse remains active
- at least one line exists
- expected date is not before order date
- all products remain active and trackable
- quantities and prices remain valid

Approval repeats the operational validation and is allowed only from `submitted`.

This prevents stale drafts or concurrent requests from bypassing the workflow.

### Receiving boundary

The purchasing API persists `quantityReceived` and receiving states but does not mutate them directly; the Goods Receiving module owns those updates.

Database guards support the receiving workflow:

- commercial line fields stay immutable after submission
- received quantity can only increase
- received quantity can only change while PO status is `approved` or `partially-received`
- approved POs may transition to partially received or received
- partially received POs may transition to received

### Supplier history

The Group 13 endpoint:

```text
GET /api/v1/suppliers/:id/purchase-history
```

now reads actual purchase orders and returns number, dates, status, subtotal as `totalAmount`, pagination, and configured currency code.

## Goods receiving

Goods receipts post physical supplier deliveries against approved purchase orders.

Endpoints:

```text
GET  /api/v1/goods-receipts
GET  /api/v1/goods-receipts/form-options
GET  /api/v1/goods-receipts/purchase-order-options?search=...
GET  /api/v1/goods-receipts/purchase-orders/:purchaseOrderId/context
GET  /api/v1/goods-receipts/:id
POST /api/v1/goods-receipts
PUT  /api/v1/goods-receipts/:id
POST /api/v1/goods-receipts/:id/post
```

The entire feature requires `purchase.receive`.

### Receipt workflow

```text
approved / partially-received PO
        ↓
create receipt draft
        ↓
enter physical received quantities
        ↓
post receipt
        ↓
lock receipt + purchase order
        ↓
revalidate current PO remaining quantities
        ↓
create receipt stock movements
        ↓
increase PO quantityReceived values
        ↓
update PO status
        ↓
mark receipt posted
        ↓
commit
```

Draft receipts do not change inventory.

Only purchase orders in `approved` or `partially-received` status are eligible. The receipt warehouse is inherited from the PO and cannot be changed on the receipt.

Once a receipt draft exists, its `purchaseOrderId` is immutable.

### Partial receiving

The PO context endpoint returns:

```text
quantityOrdered
quantityReceived
quantityRemaining
```

for each PO line.

A receipt request includes only positive lines:

```text
purchaseOrderLineId
quantityReceived
```

Each PO line can appear only once per receipt. Draft save validates the currently remaining PO quantity, and posting validates it again after acquiring the purchase-order row lock.

The PO row lock serializes concurrent receipt posting for the same purchase order, preventing two receipts from consuming the same remaining quantity.

### Atomic inventory posting

Each posted receipt line creates an immutable `receipt` stock movement in the PO warehouse.

The PO line commercial `unitPrice` is supplied to the movement as inventory unit cost, so the inventory ledger updates weighted-average cost through the existing Group 10 movement boundary.

Each receipt line preserves:

```text
quantityReceivedBefore
balanceBefore
balanceAfter
movementId
```

The movement reference is:

```text
type: goods-receipt
number: GRN-...
referencePath: /receiving/:id
```

All receipt lines are applied in deterministic product order to reduce inventory-row deadlock risk.

If any line, movement, PO update, or status transition fails, the complete posting transaction rolls back.

### Purchase-order status synchronization

After posting all receipt lines:

```text
any ordered quantity remains
  → partially-received

all ordered quantity received
  → received
```

Received quantities never exceed ordered quantities and can only increase.

### Receipt lifecycle

Goods receipt statuses are:

```text
draft
posted
cancelled
```

The current public API exposes draft creation/editing and posting. `cancelled` remains reserved for a future controlled cancellation workflow.

Posted receipts and their lines are immutable at both API and PostgreSQL levels. Corrections must use an explicit authorized inventory transaction rather than rewriting receipt history.

### Receipt list queries

The list endpoint supports:

```text
page
pageSize
search
sort
direction
purchaseOrderId
warehouseId
status
dateFrom
dateTo
```

Search covers receipt number, supplier delivery reference, PO number, supplier code/name, and warehouse code/name.

Supported sort fields:

```text
createdAt
number
purchaseOrderNumber
supplierName
warehouseName
receiptDate
status
postedAt
```

The default Angular sort is `createdAt desc`.

## Customers

Customers are sales master data. Customer master data is consumed by the Sales Order workflow.

Endpoints:

```text
GET   /api/v1/customers
GET   /api/v1/customers/:id
POST  /api/v1/customers
PUT   /api/v1/customers/:id
PATCH /api/v1/customers/:id/status
```

Permissions:

```text
customer.view
customer.manage
```

List/detail require `customer.view`. Create, update, activate, and deactivate require `customer.manage`.

### Customer fields

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

Validation and normalization:

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

### Search and filtering

The list supports:

```text
page
pageSize
search
sort
direction
active
```

Search covers code, name, contact name, email, and phone.

Supported sort fields:

```text
name
code
contactName
email
countryCode
updatedAt
createdAt
```

The Angular customer list defaults to active customers sorted by `name asc`.

### Lifecycle

Customers use activation/deactivation rather than hard deletion.

Inactive customers remain valid historical identities. Inactive customers cannot be selected for new sales orders, while existing sales-order references remain valid.

### RBAC synchronization

Group 16 makes customer permissions first-class in the backend permission catalog:

```text
customer.view
customer.manage
```

The Sales system role receives both permissions and Viewer receives `customer.view`.

After deploying this group to an existing database, run the seed command so the new permission records and system-role mappings are synchronized.

## Sales orders

Sales orders implement reservation, dispatch, completion, and return workflows against warehouse inventory.

Endpoints:

```text
GET  /api/v1/sales-orders
GET  /api/v1/sales-orders/form-options
GET  /api/v1/sales-orders/customer-options?search=...
GET  /api/v1/sales-orders/customers/:customerId/option
GET  /api/v1/sales-orders/product-options?warehouseId=...&search=...
GET  /api/v1/sales-orders/:id
POST /api/v1/sales-orders
PUT  /api/v1/sales-orders/:id
POST /api/v1/sales-orders/:id/confirm
POST /api/v1/sales-orders/:id/cancel
POST /api/v1/sales-orders/:id/dispatch
POST /api/v1/sales-orders/:id/complete
POST /api/v1/sales-orders/:id/returns
```

Permissions:

```text
sales.view
sales.create
sales.dispatch
sales.return
```

### Sales lifecycle

```text
draft
  ↓ confirm
confirmed
  ├─ cancel → cancelled
  ↓ dispatch
dispatched
  ↓ complete
completed
```

Drafts are the only editable commercial state. Confirmed orders are fully reserved. Dispatch is full-order dispatch in Group 17; partial dispatch is intentionally not represented by silently mutating line quantities.

### Draft sales orders

A draft contains:

```text
customerId
warehouseId
orderDate
notes
lines[]
  productId
  quantity
  unitPrice
```

Rules:

- customer must be active
- warehouse must be active
- products must be active and trackable
- selected products must have an inventory balance in the fulfillment warehouse
- duplicate products are rejected
- at least one and at most 200 lines are supported
- quantities must be positive with up to four decimal places
- prices must be non-negative with up to four decimal places

Customer lookup returns active customers only.

Product lookup is scoped to the fulfillment warehouse and returns:

```text
quantityAvailable = quantityOnHand - quantityReserved
defaultUnitPrice  = product sellingPrice
```

Displayed availability is advisory until confirmation.

### Authoritative pricing

Angular may calculate draft totals for immediate feedback, but the API persists authoritative values.

The backend calculates each line total and subtotal with fixed-point four-decimal arithmetic.

PostgreSQL also enforces:

```text
quantity > 0
unitPrice >= 0
lineTotal = round(quantity * unitPrice, 4)
subtotal >= 0
```

Draft subtotal is synchronized from persisted line totals by a database trigger.

### Confirmation and reservation

Confirmation acquires the sales-order row lock and deterministic product/warehouse advisory locks before reserving stock.

For every line:

```text
quantityReserved += orderedQuantity
quantityOnHand    unchanged
```

Confirmation succeeds only if the complete order can be reserved:

```text
quantityOnHand - quantityReserved >= orderedQuantity
```

If any line lacks sufficient current available stock, the complete transaction rolls back.

### Cancellation

Only a confirmed order can be cancelled.

Cancellation releases the full order reservation atomically:

```text
quantityReserved -= order reservation
quantityOnHand    unchanged
```

Cancellation creates no stock movement because no physical inventory moved.

### Dispatch

Dispatch consumes the reservation and physical stock together.

For each line the ledger's reservation-aware sale primitive atomically performs:

```text
quantityReserved -= dispatched quantity
quantityOnHand    -= dispatched quantity
```

It also verifies the dispatch cannot consume inventory reserved by another order.

Each line creates one immutable `sale` movement using the warehouse's current average cost as the inventory cost basis.

The movement reference is:

```text
type: sales-order
number: SO-...
referencePath: /sales/:id
```

The line stores:

```text
quantityReserved
quantityDispatched
saleMovementId
```

Group 17 supports full-order dispatch only:

```text
quantityReserved   ∈ {0, ordered quantity}
quantityDispatched ∈ {0, ordered quantity}
```

### Completion

Completion is operational closure only.

```text
dispatched → completed
```

It does not create another stock movement because inventory already moved at dispatch.

### Returns

Returns are separate immutable transactions against dispatched or completed orders.

Returnable quantity:

```text
quantityDispatched - quantityReturned
```

Each accepted return line:

1. revalidates current returnable quantity
2. creates an immutable `return-in` movement
3. increases stock in the original fulfillment warehouse
4. increments cumulative `quantityReturned`
5. records an immutable `SRN-...` return transaction

The return movement uses the original sale movement's unit cost, preserving the dispatched inventory cost basis when stock is returned.

Return movement reference:

```text
type: sales-return
number: SRN-...
referencePath: /sales/:salesOrderId
```

Returns never rewrite or delete the original sale movement.

### Concurrency and immutability

Sales transitions use row locking and deterministic inventory advisory locks.

Concurrent confirmations, cancellations, dispatches, or returns for the same order cannot independently consume the same reservation/returnable quantity.

PostgreSQL protects:

- sales-order identity and workflow transitions
- commercial immutability after confirmation
- reservation and dispatch quantity shape
- returned quantity range
- immutable sale movement references
- immutable sales-return headers and lines

### RBAC synchronization

Group 17 adds:

```text
sales.dispatch
sales.return
```

to the canonical permission catalog. The Sales system role receives both permissions.

Existing databases should run the seed command after deployment so new permissions and system-role mappings are synchronized.

## Stock counts

Stock counts implement warehouse physical-count sessions with paginated counting, review, and atomic variance posting.

Endpoints:

```text
GET  /api/v1/stock-counts
GET  /api/v1/stock-counts/form-options
GET  /api/v1/stock-counts/:id
GET  /api/v1/stock-counts/:id/lines
POST /api/v1/stock-counts
POST /api/v1/stock-counts/:id/start
PUT  /api/v1/stock-counts/:id/lines
POST /api/v1/stock-counts/:id/submit
POST /api/v1/stock-counts/:id/approve-and-post
```

Permissions:

```text
inventory.count
inventory.count.approve
```

Creation, starting, line counting, and submission require `inventory.count`.

Approval and posting require the separate `inventory.count.approve` permission.

### Workflow

```text
draft
  ↓ start + snapshot
counting
  ↓ all lines counted
submitted
  ↓ approve and post
posted
```

`cancelled` is retained in the status model for a future controlled cancellation workflow; Group 18 does not expose an arbitrary cancellation endpoint.

### Snapshot model

Creating a draft does not snapshot inventory.

Starting a count:

1. locks the stock-count row
2. acquires the warehouse inventory advisory lock
3. verifies no other active count exists for the warehouse
4. verifies the warehouse is active
5. snapshots the configured stock-count concurrency policy onto the count
6. under `freeze`, rejects warehouses with outstanding reservations
7. captures the database timestamp
8. snapshots every trackable inventory balance
9. records expected quantity and average unit cost for each product
10. transitions the session to `counting`

The snapshot line stores:

```text
productId
expectedQuantity
snapshotUnitCost
countedQuantity
countedAt
quantityAtCount
varianceQuantity
balanceBefore
balanceAfter
movementId
```

An empty warehouse cannot be started because the Angular workflow requires at least one count line.

### Paginated counting

Count lines are server-backed and paginated.

The line endpoint supports:

```text
page
pageSize
search
sort
direction
varianceOnly
```

Search covers SKU and product name.

Supported line sort fields:

```text
productName
sku
expectedQuantity
countedQuantity
varianceQuantity
```

Only the `counting` state accepts counted-quantity updates.

Counted quantity may be zero but cannot be negative.

The backend persists authoritative variance:

```text
varianceQuantity = countedQuantity - expectedQuantity
```

Angular never supplies the variance.

### Submission

Submission requires every snapshot line to have a counted quantity.

After transition to `submitted`, counted and variance quantities are immutable.

### Stock-count concurrency policy

Group 22 makes the count concurrency policy configurable. The selected policy is snapshotted onto each count when counting starts, so a later settings change cannot alter an in-progress count.

`freeze` keeps the original strict warehouse behavior while a count is `counting` or `submitted`:

- physical stock movements in that warehouse are blocked
- new inventory reservations are blocked
- transfers touching the warehouse are blocked
- receipts, adjustments, dispatches, and returns are blocked

`reconcile` allows normal warehouse movements and reservations to continue. When an operator saves a counted line, the backend acquires the same warehouse advisory lock used by inventory movements, captures the current on-hand quantity as `quantityAtCount`, reconciles the line's authoritative expected quantity to that balance, and calculates:

```text
varianceQuantity = countedQuantity - expectedQuantity
```

Later legitimate movements remain preserved because posting applies the measured variance to the then-current balance rather than replacing the balance with the counted quantity.

The service layer and PostgreSQL triggers enforce the same policy. Only one active stock count per warehouse is allowed under either mode.

### Approval and posting

`approve-and-post` runs as one transaction.

Before changing inventory it verifies:

- count status is `submitted`
- warehouse remains active
- every line remains counted
- no line was already posted
- under `freeze`, no reserved quantities exist
- under `freeze`, no unexpected stock movement was created after the snapshot
- under `freeze`, every current on-hand balance still equals its captured expected quantity
- under `reconcile`, every counted line has a captured count-time inventory context

For every non-zero variance the backend creates one immutable:

```text
stock-count
```

movement.

Movement quantity is the variance itself:

```text
counted > expected → positive movement
counted < expected → negative movement
counted = expected → no movement
```

The captured average unit cost is supplied to the movement so positive count corrections retain the warehouse inventory cost basis.

Movement reference:

```text
type: stock-count
number: CNT-...
referencePath: /stock-counts/:id
```

Each non-zero variance line records:

```text
movementId
balanceBefore
balanceAfter
```

Zero-variance lines intentionally create no movement.

If any validation or movement fails, the entire approval transaction rolls back.

### Database protection

PostgreSQL additionally enforces:

- only one active count per warehouse
- non-negative counted quantities
- authoritative variance formula
- frozen-count expected quantities are immutable while counting
- reconciled expected quantities may change only while the count is actively being counted
- counted quantity, count-time inventory context, expected quantity, and variance are locked after submission
- the selected concurrency policy is immutable after count start
- posted count and line immutability
- non-zero posted variances require movement links
- zero variances cannot have movements
- movement and reservation blocking only for active counts using `freeze`

Corrections after posting require a new authorized inventory transaction instead of rewriting count history.

### RBAC synchronization

Group 18 adds:

```text
inventory.count.approve
```

to the canonical permission catalog.

Inventory Manager receives count approval. Warehouse Staff retains `inventory.count` without approval authority.

Existing databases should run the seed command after deployment.

## Dashboard

The dashboard is a read-only operational snapshot built from authoritative inventory, purchasing, receiving, and movement data.

Endpoint:

```text
GET /api/v1/dashboard
```

The endpoint requires:

```text
dashboard.view
```

The response matches the Angular dashboard contract:

```text
generatedAt
metrics
stockRisks
pendingPurchaseOrders
pendingReceipts
recentMovements
```

### Snapshot consistency

Dashboard queries execute inside a PostgreSQL `REPEATABLE READ` transaction.

The generated timestamp and all KPI/detail queries therefore represent one coherent database snapshot instead of independently observing different committed states while the page is loading.

### KPI definitions

```text
totalProducts
  active product master records

totalSkus
  distinct active, trackable products represented
  in active-warehouse inventory balances

totalWarehouses
  active warehouses

lowStockProducts
  distinct products with at least one active-warehouse
  available balance > 0 and <= reorder point

outOfStockProducts
  distinct products with at least one active-warehouse
  available balance <= 0

pendingPurchaseOrders
  draft + submitted + approved + partially-received POs

pendingReceipts
  approved + partially-received POs requiring receiving work

inventoryValue
  SUM(quantityOnHand × weightedAverageCost)
  across active trackable inventory in active warehouses
```

Stock risk is based on:

```text
available = quantityOnHand - quantityReserved
```

The stock-risk table returns the 10 highest-priority warehouse/product risks, with out-of-stock balances first.

### Pending purchasing work

The dashboard returns up to eight purchase orders requiring attention.

Priority order is:

```text
submitted
draft
approved
partially-received
```

Expected date and creation time provide deterministic secondary ordering.

### Pending receiving work

Approved and partially received purchase orders are receiving workload.

If a PO already has a draft goods receipt, the dashboard uses that receipt's number and ID and reports the item as `in-progress`.

Otherwise the PO itself represents a `pending` receiving item.

Partially received POs are also considered `in-progress`.

### Recent movements

The dashboard returns the latest 10 stock movements using the canonical movement types:

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

The movement quantity is the authoritative signed ledger quantity, and the reference is the originating document number when available.

### Detail-level authorization

`dashboard.view` authorizes aggregate dashboard KPIs.

Detailed sections retain their domain boundaries server-side:

```text
stockRisks
recentMovements
  → inventory.view

pendingPurchaseOrders
  → purchase.view

pendingReceipts
  → purchase.receive
```

If a user can view the dashboard but lacks one of those domain permissions, that detailed collection is returned empty. This prevents Angular presentation rules from becoming the only authorization boundary.

No dashboard tables or materialized KPI state are introduced in Group 19. Metrics are calculated from current authoritative data.

## Reports

Group 20 provides read-only operational reports over the existing authoritative domain tables.

Endpoints:

```text
GET /api/v1/reports/options
GET /api/v1/reports/:id
GET /api/v1/reports/:id/export
```

All report endpoints require:

```text
reports.view
```

The built-in Sales role now receives `reports.view` so its sales-order and sales-return reports are accessible without granting broader administrative permissions.

### Available reports

```text
Inventory
  inventory-balance
  inventory-valuation
  stock-movements
  low-stock
  out-of-stock
  adjustments
  transfers
  stock-count-variance

Purchasing
  purchase-history
  receiving
  supplier-purchases

Sales
  sales-orders
  sales-returns
```

### Common report contract

Interactive report responses match the Angular report viewer:

```text
data
pagination
summary
generatedAt
currencyCode   // valuation/purchasing/sales monetary reports
```

Pagination:

```text
page
pageSize
totalItems
totalPages
```

Common query parameters are:

```text
page
pageSize
search
sort
direction
warehouseId
movementType
dateFrom
dateTo
```

Each report uses only the filters defined by the Angular report definition. Irrelevant common filter values do not alter a report.

Sort fields are explicitly whitelisted per report. User-provided column names are never interpolated directly into SQL.

### Snapshot consistency

Each interactive report executes inside a PostgreSQL:

```text
REPEATABLE READ
READ ONLY
```

transaction.

Rows, summary metrics, pagination totals, and `generatedAt` therefore describe one coherent committed snapshot.

### Inventory reports

`inventory-balance` reports current on-hand, reserved, available, and reorder quantities by SKU and warehouse.

`inventory-valuation` uses:

```text
inventoryValue = quantityOnHand × weightedAverageCost
```

and reports the configured application currency.

`stock-movements` reads the immutable movement ledger and supports movement type/date filters.

`low-stock` uses:

```text
available > 0
available <= reorderPoint
shortage = reorderPoint - available
```

`out-of-stock` uses:

```text
available <= 0
```

where:

```text
available = quantityOnHand - quantityReserved
```

`adjustments` reports posted adjustments only and exposes signed quantity change.

`transfers` reports transfer documents and line counts across draft, posted, and cancelled states.

`stock-count-variance` reports non-zero variance lines from posted physical counts only.

### Purchasing reports

`purchase-history` reports purchase orders across workflow states. The `totalPurchased` summary excludes cancelled orders.

`receiving` reports posted goods receipts only, including receipt count, received-line count, and total received quantity.

`supplier-purchases` groups purchase activity by supplier. Purchased value excludes cancelled purchase orders.

### Sales reports

`sales-orders` reports sales documents across workflow states.

Its summary includes:

```text
orderCount
dispatchedCount
totalSalesValue
```

`dispatchedCount` includes dispatched and completed orders. `totalSalesValue` excludes cancelled orders.

`sales-returns` reports immutable return documents with line count and returned quantity.

### CSV export

Every report supports:

```text
GET /api/v1/reports/:id/export?format=csv
```

The CSV export uses the same filters and sort order as the interactive report and exports all matching rows rather than the current page.

Safety controls:

- maximum 50,000 rows per export
- oversized exports return `REPORT_EXPORT_TOO_LARGE`
- CSV cells are RFC-style quoted when required
- text beginning with spreadsheet formula characters (`=`, `+`, `-`, `@`) is escaped before export
- UTF-8 BOM is included for spreadsheet compatibility

No reporting tables, cached totals, or materialized report state are introduced in Group 20.

## Audit trail

Group 21 adds an append-only audit trail for security administration, master-data changes, and business workflow transitions.

Endpoints:

```text
GET /api/v1/audit-logs
GET /api/v1/audit-logs/options
GET /api/v1/audit-logs/:id
```

Audit access uses the existing administrative permission:

```text
user.manage
```

through `Permission.AuditRead`. No new standalone audit permission is introduced in Group 21.

### Audit record

Each audit event can contain:

```text
id
action
entityType
entityId
actor
before
after
ipAddress
requestId
createdAt
```

`requestId` is the same request correlation ID returned in the `X-Request-Id` response header.

Client IP and request ID are captured from request-scoped context rather than being passed manually through every service method.

### Querying

The audit list is server-side paginated and supports:

```text
page
pageSize
search
sort
direction
userId
action
entityType
entityId
dateFrom
dateTo
```

Search covers action, entity type, entity ID, request ID, and actor name/email.

Supported sort fields are:

```text
createdAt
action
entityType
```

The options endpoint returns the actions, entity types, and actors represented in the current audit history.

### Transactional auditing

For business and administration changes, the audit event is written inside the same Prisma transaction as the state mutation whenever the underlying operation is transactional.

This means:

```text
business change succeeds + audit succeeds
or
both roll back
```

Audit history is not written as a best-effort background side effect.

### Covered events

Security and access administration:

```text
auth.login
auth.logout
user.created
user.updated
user.status_changed
user.roles_changed
user.password_reset
role.created
role.updated
role.permissions_changed
role.deleted
```

Master data:

```text
category.created
category.updated
category.status_changed

unit.created
unit.updated
unit.status_changed

product.created
product.updated
product.status_changed

warehouse.created
warehouse.updated
warehouse.status_changed

supplier.created
supplier.updated
supplier.status_changed

customer.created
customer.updated
customer.status_changed
```

Inventory and operational documents:

```text
inventory-adjustment.created
inventory-adjustment.updated
inventory-adjustment.posted

inventory-transfer.created
inventory-transfer.updated
inventory-transfer.posted

purchase-order.created
purchase-order.updated
purchase-order.submitted
purchase-order.approved

goods-receipt.created
goods-receipt.updated
goods-receipt.posted

sales-order.created
sales-order.updated
sales-order.confirmed
sales-order.cancelled
sales-order.dispatched
sales-order.completed

sales-return.created

stock-count.created
stock-count.started
stock-count.lines_updated
stock-count.submitted
stock-count.posted
```

### Audit trail versus stock ledger

The audit trail and stock movement ledger have different responsibilities.

The stock movement ledger remains the accounting history for physical inventory quantity changes.

The audit trail records who changed application/business state, when it happened, and the safe before/after context.

A dispatch, receipt, adjustment, transfer, return, or stock-count posting can therefore have both:

- immutable stock movement records describing inventory effects
- an immutable audit event describing the user action and workflow transition

The audit trail never replaces the stock ledger.

### Sensitive-data handling

Audit snapshots are sanitized before persistence.

Keys associated with credentials or secrets are redacted, including password, token, secret, authorization, cookie, API-key, and private-key fields.

Password reset audit events record only that a reset occurred and how many active sessions were revoked. Passwords and password hashes are not stored.

Refresh-token rotation is intentionally not added to the business audit trail, avoiding high-volume token lifecycle noise and secret-adjacent data.

Snapshot depth, collection size, and long string values are bounded before JSON persistence.

### Database immutability

PostgreSQL enforces append-only audit history.

The Group 21 migration adds:

- indexes for action/date, entity/date, and request ID lookup
- maximum lengths for action, entity type, and entity ID
- non-blank checks for action and entity type
- a trigger rejecting every `UPDATE` and `DELETE` against `audit_logs`

Corrections are represented by new business actions; historical audit records are never rewritten.

## Application settings

Group 22 implements the Angular administration settings contract.

Endpoints:

```text
GET /api/v1/administration/settings
GET /api/v1/administration/settings/options
PUT /api/v1/administration/settings
```

All settings endpoints require:

```text
settings.manage
```

The public settings contract contains:

```text
organizationName
timezone
currencyCode
defaultPageSize
allowNegativeStock
stockCountConcurrencyPolicy
updatedAt
updatedBy
```

Only this typed registry can be changed through the API. Arbitrary `system_settings` keys are not exposed as writable application settings.

### Validation and options

The backend validates:

- organization name: required, maximum 200 characters
- timezone: a runtime-supported IANA timezone
- currency: a runtime-supported ISO currency code
- default page size: integer from 10 through 100
- negative stock: boolean
- stock-count policy: `freeze` or `reconcile`

The options endpoint returns the timezones and currencies supported by the running Node.js/ICU runtime.

### Runtime behavior

`inventory.allowNegativeStock` is enforced by the stock-movement transaction path.

`application.currencyCode` is used by current product monetary presentation, dashboard valuation, and reports. New purchase orders and sales orders snapshot the current currency code onto the document; changing the setting does not rewrite historical document currencies or convert stored monetary amounts.

`inventory.stockCountConcurrencyPolicy` is snapshotted when a stock count starts. See the stock-count concurrency section for `freeze` and `reconcile` behavior.

`inventory.defaultPageSize` is exposed as the application/UI pagination default. Explicit API `pageSize` values remain bounded by the API maximum, and endpoints that omit the parameter continue to use the server pagination fallback.

Organization name and timezone are persisted application metadata. Timestamps remain stored and transported as absolute database/API timestamps rather than being rewritten into the configured presentation timezone.

### Atomic updates and audit

All six settings are updated in one PostgreSQL transaction protected by an application-settings advisory lock. Concurrent administrators therefore cannot interleave individual setting keys.

Every successful update records:

```text
settings.updated
```

in the immutable audit trail with safe before/after snapshots and the authenticated actor.

The settings table also records the latest updating user so the Angular settings page can display `updatedAt` and `updatedBy`.

### Migration defaults

The Group 22 migration creates missing values with these defaults:

```text
organizationName             Inventory System
timezone                     UTC
currencyCode                 AED
defaultPageSize              25
allowNegativeStock           false
stockCountConcurrencyPolicy  freeze
```

Existing configured keys are preserved by the migration.

When `npm run db:seed` is run, `ORGANIZATION_NAME`, `TIMEZONE`, and `CURRENCY_CODE` may bootstrap their corresponding database values only while those settings have never been updated through the Settings API. Once an authenticated settings update records an updating user, later seeds do not overwrite that API-managed value.

## Query hardening

Group 23 standardizes search, filter, sort, and pagination behavior across list, lookup, audit, stock-ledger, stock-count, and reporting endpoints.

### Query normalization

Query strings are normalized before validation:

- optional string filters are trimmed
- blank optional filters are treated as omitted
- lookup search terms are trimmed before minimum-length validation
- booleans accept only `true` or `false`
- numeric query parameters accept decimal integer text only
- repeated/array query values remain invalid instead of being silently coerced into strings

The query transforms inspect the original request value rather than the value produced by global implicit conversion. This prevents values such as repeated parameters or non-standard numeric syntax from bypassing the intended DTO validation.

### Pagination

Paginated endpoints enforce:

```text
page      1 .. 1,000,000
pageSize  1 .. 100
```

The existing default page size remains 25 when the client does not send `pageSize`.

Prisma-backed paginated resources use a stable `id` tie-breaker after the requested sort. Raw-SQL lists and reports already include deterministic ID tie-breakers. This prevents duplicate or skipped rows between adjacent pages when several records have the same primary sort value.

### Search semantics

Search remains case-insensitive, but user input is treated as literal text.

The characters:

```text
%
_
\
```

are escaped before being passed to Prisma `contains` filters or PostgreSQL `ILIKE` patterns. They therefore no longer behave as accidental SQL wildcard controls.

All raw SQL search values continue to be supplied as bind parameters. Sort expressions are never taken directly from user input: resource services map approved sort names explicitly, and reports resolve sort names through the static report specification.

### Date filters

Date-range parsing is centralized.

Inventory movement, stock-count, audit, and report filters accept valid ISO dates/timestamps. A date-only upper bound is treated as the end of that calendar date by converting it to an exclusive next-day boundary.

Purchase-order, goods-receipt, and sales-order business-date filters continue to require valid `YYYY-MM-DD` calendar dates.

For every range:

```text
dateFrom <= dateTo
```

Invalid calendar dates and reversed ranges return a validation-style HTTP 400 response.

### Filter validation

Typed filters remain constrained at the DTO boundary:

- entity IDs use UUID v4 validation
- statuses and movement types use explicit enum/value sets
- stock booleans use strict boolean parsing
- search and reference strings retain bounded lengths
- unknown query properties are rejected by the global validation pipe

The earlier `order` sort-direction parameter remains supported as a compatibility alias; `direction` remains the preferred Angular contract.

## OpenAPI / Swagger

Group 24 publishes the backend contract directly from the NestJS application.

Default documentation endpoints:

```text
GET /api/v1/docs
GET /api/v1/docs/openapi.json
GET /api/v1/docs/openapi.yaml
```

The Swagger UI is intended for interactive API inspection and manual testing. The JSON document is the canonical machine-readable contract for Angular integration, generated clients, and contract checks.

The OpenAPI document includes:

- all NestJS controllers and routes under the configured API prefix
- request body and query DTO schemas generated by the Nest Swagger compiler plugin
- `class-validator` constraints such as lengths, ranges, formats, and enum values
- stable operation IDs based on controller and handler names
- JWT bearer authentication using the `access-token` security scheme
- public security exceptions for login, refresh, and health endpoints
- reusable standardized API error responses
- pagination metadata schema
- JSON and YAML raw specifications

Non-2xx JSON responses continue to use the runtime `ApiErrorResponse` envelope documented earlier in this README.

Swagger is enabled by default. Production can disable the documentation routes without changing code:

```text
OPENAPI_ENABLED=false
```

The documentation location and contract version are configurable:

```text
OPENAPI_PATH=docs
OPENAPI_VERSION=1.0.0
```

Changing `OPENAPI_PATH` changes only the documentation route. It does not change the application API prefix.

## Automated testing

Group 25 adds automated regression coverage for the backend's shared contracts and critical security/application flows.

The test stack uses Jest with SWC for TypeScript transformation, Nest's official testing utilities, and Supertest for HTTP-level verification.

Coverage currently includes:

- pagination windows and metadata
- strict query normalization and validation
- date-only and timestamp range handling
- literal search escaping for Prisma and PostgreSQL patterns
- nested validation-error flattening
- RBAC permission enforcement
- authentication login, refresh-token rotation, logout, and audit orchestration
- OpenAPI error/security contract generation
- liveness/readiness HTTP behavior
- request correlation IDs
- standardized HTTP error envelopes
- login DTO validation and normalization

The normal test suite does not require a running PostgreSQL instance. Database collaborators are replaced with deterministic fakes so local and CI regression tests remain fast and repeatable.

Commands:

```bash
npm test
npm run test:watch
npm run test:cov
npm run test:e2e
npm run check
```

`npm run check` now runs linting, the production Nest build, and the complete automated test suite.

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
OPENAPI_ENABLED=true
OPENAPI_PATH=docs
OPENAPI_VERSION=1.0.0
CORS_ORIGINS=http://localhost:4200
CURRENCY_CODE=AED
ORGANIZATION_NAME=Inventory System
TIMEZONE=UTC
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
npm test
npm run test:watch
npm run test:cov
npm run test:e2e
npm run check
```
