export const Permission = {
  UsersRead: 'users.read',
  UsersCreate: 'users.create',
  UsersUpdate: 'users.update',
  UsersDeactivate: 'users.deactivate',
  UsersAssignRoles: 'users.assign_roles',
  RolesRead: 'roles.read',
  RolesCreate: 'roles.create',
  RolesUpdate: 'roles.update',
  RolesDelete: 'roles.delete',
  RolesAssignPermissions: 'roles.assign_permissions',
  PermissionsRead: 'permissions.read',
  DashboardView: 'dashboard.view',
  CategoriesRead: 'categories.read',
  CategoriesManage: 'categories.manage',
  UnitsRead: 'units.read',
  UnitsManage: 'units.manage',
  ProductsRead: 'products.read',
  ProductsCreate: 'products.create',
  ProductsUpdate: 'products.update',
  ProductsDeactivate: 'products.deactivate',
  WarehousesRead: 'warehouses.read',
  WarehousesManage: 'warehouses.manage',
  InventoryRead: 'inventory.read',
  InventoryAdjust: 'inventory.adjust',
  InventoryTransfer: 'inventory.transfer',
  InventoryCount: 'inventory.count',
  SuppliersRead: 'suppliers.read',
  SuppliersManage: 'suppliers.manage',
  PurchasesRead: 'purchases.read',
  PurchasesCreate: 'purchases.create',
  PurchasesApprove: 'purchases.approve',
  PurchasesReceive: 'purchases.receive',
  CustomersRead: 'customers.read',
  CustomersManage: 'customers.manage',
  SalesRead: 'sales.read',
  SalesCreate: 'sales.create',
  SalesConfirm: 'sales.confirm',
  ReportsView: 'reports.view',
  AuditRead: 'audit.read',
  SettingsManage: 'settings.manage',
} as const;

export type PermissionKey =
  (typeof Permission)[keyof typeof Permission];

export const PERMISSION_DEFINITIONS: ReadonlyArray<{
  key: PermissionKey;
  description: string;
}> = [
  { key: Permission.UsersRead, description: 'View users' },
  { key: Permission.UsersCreate, description: 'Create users' },
  { key: Permission.UsersUpdate, description: 'Update users and passwords' },
  { key: Permission.UsersDeactivate, description: 'Activate or deactivate users' },
  { key: Permission.UsersAssignRoles, description: 'Assign roles to users' },
  { key: Permission.RolesRead, description: 'View roles' },
  { key: Permission.RolesCreate, description: 'Create custom roles' },
  { key: Permission.RolesUpdate, description: 'Update custom roles' },
  { key: Permission.RolesDelete, description: 'Delete unused custom roles' },
  { key: Permission.RolesAssignPermissions, description: 'Assign permissions to custom roles' },
  { key: Permission.PermissionsRead, description: 'View permission catalog' },
  { key: Permission.DashboardView, description: 'View dashboard' },
  { key: Permission.CategoriesRead, description: 'View product categories' },
  { key: Permission.CategoriesManage, description: 'Manage product categories' },
  { key: Permission.UnitsRead, description: 'View units of measure' },
  { key: Permission.UnitsManage, description: 'Manage units of measure' },
  { key: Permission.ProductsRead, description: 'View products' },
  { key: Permission.ProductsCreate, description: 'Create products' },
  { key: Permission.ProductsUpdate, description: 'Update products' },
  { key: Permission.ProductsDeactivate, description: 'Activate or deactivate products' },
  { key: Permission.WarehousesRead, description: 'View warehouses' },
  { key: Permission.WarehousesManage, description: 'Manage warehouses' },
  { key: Permission.InventoryRead, description: 'View inventory balances and movements' },
  { key: Permission.InventoryAdjust, description: 'Create stock adjustments' },
  { key: Permission.InventoryTransfer, description: 'Transfer stock between warehouses' },
  { key: Permission.InventoryCount, description: 'Perform stock counts' },
  { key: Permission.SuppliersRead, description: 'View suppliers' },
  { key: Permission.SuppliersManage, description: 'Manage suppliers' },
  { key: Permission.PurchasesRead, description: 'View purchase orders' },
  { key: Permission.PurchasesCreate, description: 'Create purchase orders' },
  { key: Permission.PurchasesApprove, description: 'Approve purchase orders' },
  { key: Permission.PurchasesReceive, description: 'Receive purchase orders' },
  { key: Permission.CustomersRead, description: 'View customers' },
  { key: Permission.CustomersManage, description: 'Manage customers' },
  { key: Permission.SalesRead, description: 'View sales' },
  { key: Permission.SalesCreate, description: 'Create sales' },
  { key: Permission.SalesConfirm, description: 'Confirm sales and issue stock' },
  { key: Permission.ReportsView, description: 'View reports' },
  { key: Permission.AuditRead, description: 'View audit logs' },
  { key: Permission.SettingsManage, description: 'Manage system settings' },
];

export const SystemRole = {
  Administrator: 'Administrator',
  InventoryManager: 'Inventory Manager',
  WarehouseStaff: 'Warehouse Staff',
  Purchasing: 'Purchasing',
  Sales: 'Sales',
  Viewer: 'Viewer',
} as const;

const ALL_PERMISSIONS = PERMISSION_DEFINITIONS.map(({ key }) => key);

export const SYSTEM_ROLE_DEFINITIONS: ReadonlyArray<{
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
}> = [
  { name: SystemRole.Administrator, description: 'Full system administration', permissions: ALL_PERMISSIONS },
  {
    name: SystemRole.InventoryManager,
    description: 'Manage catalog, warehouses, and inventory operations',
    permissions: [
      Permission.DashboardView, Permission.CategoriesRead, Permission.CategoriesManage,
      Permission.UnitsRead, Permission.UnitsManage, Permission.ProductsRead,
      Permission.ProductsCreate, Permission.ProductsUpdate, Permission.ProductsDeactivate,
      Permission.WarehousesRead, Permission.WarehousesManage, Permission.InventoryRead,
      Permission.InventoryAdjust, Permission.InventoryTransfer, Permission.InventoryCount,
      Permission.ReportsView,
    ],
  },
  {
    name: SystemRole.WarehouseStaff,
    description: 'Operate warehouse inventory',
    permissions: [
      Permission.DashboardView, Permission.ProductsRead, Permission.WarehousesRead,
      Permission.InventoryRead, Permission.InventoryAdjust, Permission.InventoryTransfer,
      Permission.InventoryCount,
    ],
  },
  {
    name: SystemRole.Purchasing,
    description: 'Manage suppliers, purchasing, and receiving',
    permissions: [
      Permission.DashboardView, Permission.ProductsRead, Permission.InventoryRead,
      Permission.SuppliersRead, Permission.SuppliersManage, Permission.PurchasesRead,
      Permission.PurchasesCreate, Permission.PurchasesApprove, Permission.PurchasesReceive,
      Permission.ReportsView,
    ],
  },
  {
    name: SystemRole.Sales,
    description: 'Manage customers and sales',
    permissions: [
      Permission.DashboardView, Permission.ProductsRead, Permission.InventoryRead,
      Permission.CustomersRead, Permission.CustomersManage, Permission.SalesRead,
      Permission.SalesCreate, Permission.SalesConfirm,
    ],
  },
  {
    name: SystemRole.Viewer,
    description: 'Read-only operational access',
    permissions: [
      Permission.DashboardView, Permission.CategoriesRead, Permission.UnitsRead,
      Permission.ProductsRead, Permission.WarehousesRead, Permission.InventoryRead,
      Permission.SuppliersRead, Permission.PurchasesRead, Permission.CustomersRead,
      Permission.SalesRead, Permission.ReportsView,
    ],
  },
];
