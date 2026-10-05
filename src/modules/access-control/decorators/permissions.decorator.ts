import { SetMetadata } from '@nestjs/common';

import type { PermissionKey } from '../rbac.constants.js';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
