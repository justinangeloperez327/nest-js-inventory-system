export const Permission = {
  UsersRead: 'user.manage',
  UsersCreate: 'user.manage',
  UsersUpdate: 'user.manage',
  UsersDeactivate: 'user.manage',
  UsersAssignRoles: 'user.manage',

  RolesRead: 'user.manage',
  RolesCreate: 'user.manage',
  RolesUpdate: 'user.manage',
  RolesDelete: 'user.manage',
  RolesAssignPermissions: 'user.manage',
  PermissionsRead: 'user.manage',

  DashboardView: 'dashboard.view',

  CategoriesRead: 'master-data.view',
  CategoriesManage: 'master-data.manage',
  UnitsRead: 'master-data.view',
  UnitsManage: 'master-data.manage',

  ProductsRead: 'product.view',
  ProductsCreate: 'product.create',
  ProductsUpdate: 'product.update',
  ProductsDeactivate: 'product.delete',

  WarehousesRead: 'master-data.view',
  WarehousesManage: 'master-data.manage',

  InventoryRead: 'inventory.view',
  InventoryAdjust: 'inventory.adjust',
  InventoryTransfer: 'inventory.transfer',
  InventoryCount: 'inventory.count',

  SuppliersRead: 'supplier.view',
  SuppliersManage: 'supplier.manage',

  PurchasesRead: 'purchase.view',
  PurchasesCreate: 'purchase.create',
  PurchasesApprove: 'purchase.approve',
  PurchasesReceive: 'purchase.receive',

  CustomersRead: 'customer.view',
  CustomersManage: 'customer.manage',

  SalesRead: 'sales.view',
  SalesCreate: 'sales.create',
  SalesConfirm: 'sales.create',
  SalesDispatch: 'sales.dispatch',
  SalesReturn: 'sales.return',

  ReportsView: 'reports.view',
  AuditRead: 'user.manage',
  SettingsManage: 'settings.manage',
} as const;

export type PermissionKey =
  (typeof Permission)[keyof typeof Permission];

export const PERMISSION_DEFINITIONS: ReadonlyArray<{
  key: PermissionKey;
  description: string;
}> = [
  {
    key: Permission.DashboardView,
    description: 'View dashboard',
  },
  {
    key: Permission.ProductsRead,
    description: 'View products',
  },
  {
    key: Permission.ProductsCreate,
    description: 'Create products',
  },
  {
    key: Permission.ProductsUpdate,
    description: 'Update products and reactivate products',
  },
  {
    key: Permission.ProductsDeactivate,
    description: 'Deactivate products',
  },
  {
    key: Permission.CategoriesRead,
    description: 'View master data',
  },
  {
    key: Permission.CategoriesManage,
    description: 'Manage master data',
  },
  {
    key: Permission.SuppliersRead,
    description: 'View suppliers',
  },
  {
    key: Permission.SuppliersManage,
    description: 'Manage suppliers',
  },
  {
    key: Permission.InventoryRead,
    description: 'View inventory balances and movements',
  },
  {
    key: Permission.InventoryAdjust,
    description: 'Create stock adjustments',
  },
  {
    key: Permission.InventoryTransfer,
    description: 'Transfer stock between warehouses',
  },
  {
    key: Permission.InventoryCount,
    description: 'Perform stock counts',
  },
  {
    key: Permission.PurchasesRead,
    description: 'View purchase orders',
  },
  {
    key: Permission.PurchasesCreate,
    description: 'Create purchase orders',
  },
  {
    key: Permission.PurchasesApprove,
    description: 'Approve purchase orders',
  },
  {
    key: Permission.PurchasesReceive,
    description: 'Receive purchase orders',
  },
  {
    key: Permission.CustomersRead,
    description: 'View customers',
  },
  {
    key: Permission.CustomersManage,
    description: 'Manage customers',
  },
  {
    key: Permission.SalesRead,
    description: 'View sales',
  },
  {
    key: Permission.SalesCreate,
    description: 'Create, edit, and confirm sales orders',
  },
  {
    key: Permission.SalesDispatch,
    description: 'Cancel, dispatch, and complete sales orders',
  },
  {
    key: Permission.SalesReturn,
    description: 'Create sales returns',
  },
  {
    key: Permission.ReportsView,
    description: 'View reports',
  },
  {
    key: Permission.UsersRead,
    description: 'Manage users, roles, permissions, and audit access',
  },
  {
    key: Permission.SettingsManage,
    description: 'Manage system settings',
  },
];

export const SystemRole = {
  Administrator: 'Administrator',
  InventoryManager: 'Inventory Manager',
  WarehouseStaff: 'Warehouse Staff',
  Purchasing: 'Purchasing',
  Sales: 'Sales',
  Viewer: 'Viewer',
} as const;

const ALL_PERMISSIONS =
  PERMISSION_DEFINITIONS.map(({ key }) => key);

export const SYSTEM_ROLE_DEFINITIONS: ReadonlyArray<{
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
}> = [
  {
    name: SystemRole.Administrator,
    description: 'Full system administration',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: SystemRole.InventoryManager,
    description:
      'Manage product master data, warehouses, and inventory operations',
    permissions: [
      Permission.DashboardView,
      Permission.CategoriesRead,
      Permission.CategoriesManage,
      Permission.ProductsRead,
      Permission.ProductsCreate,
      Permission.ProductsUpdate,
      Permission.ProductsDeactivate,
      Permission.InventoryRead,
      Permission.InventoryAdjust,
      Permission.InventoryTransfer,
      Permission.InventoryCount,
      Permission.ReportsView,
    ],
  },
  {
    name: SystemRole.WarehouseStaff,
    description: 'Operate warehouse inventory',
    permissions: [
      Permission.DashboardView,
      Permission.CategoriesRead,
      Permission.ProductsRead,
      Permission.InventoryRead,
      Permission.InventoryAdjust,
      Permission.InventoryTransfer,
      Permission.InventoryCount,
    ],
  },
  {
    name: SystemRole.Purchasing,
    description:
      'Manage suppliers, purchasing, and receiving',
    permissions: [
      Permission.DashboardView,
      Permission.ProductsRead,
      Permission.InventoryRead,
      Permission.SuppliersRead,
      Permission.SuppliersManage,
      Permission.PurchasesRead,
      Permission.PurchasesCreate,
      Permission.PurchasesApprove,
      Permission.PurchasesReceive,
      Permission.ReportsView,
    ],
  },
  {
    name: SystemRole.Sales,
    description: 'Manage sales operations',
    permissions: [
      Permission.DashboardView,
      Permission.ProductsRead,
      Permission.InventoryRead,
      Permission.CustomersRead,
      Permission.CustomersManage,
      Permission.SalesRead,
      Permission.SalesCreate,
      Permission.SalesDispatch,
      Permission.SalesReturn,
    ],
  },
  {
    name: SystemRole.Viewer,
    description: 'Read-only operational access',
    permissions: [
      Permission.DashboardView,
      Permission.CategoriesRead,
      Permission.ProductsRead,
      Permission.SuppliersRead,
      Permission.CustomersRead,
      Permission.InventoryRead,
      Permission.PurchasesRead,
      Permission.SalesRead,
      Permission.ReportsView,
    ],
  },
];
