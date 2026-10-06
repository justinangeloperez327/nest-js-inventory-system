import {
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, jest } from '@jest/globals';

import { PermissionsGuard } from './permissions.guard.js';
import { Permission } from '../rbac.constants.js';

function contextWithPermissions(
  permissions: string[],
): ExecutionContext {
  const handler = () => undefined;
  class Controller {}

  return {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          permissions,
        },
      }),
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function guardRequiring(...required: string[]): PermissionsGuard {
  const reflector = {
    getAllAndMerge: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;

  return new PermissionsGuard(reflector);
}

describe('PermissionsGuard', () => {
  it('allows routes without permission requirements', () => {
    const guard = guardRequiring();

    expect(guard.canActivate(contextWithPermissions([]))).toBe(true);
  });

  it('allows a user that owns every required permission', () => {
    const guard = guardRequiring(
      Permission.InventoryRead,
      Permission.InventoryAdjust,
    );

    expect(
      guard.canActivate(
        contextWithPermissions([
          Permission.InventoryRead,
          Permission.InventoryAdjust,
        ]),
      ),
    ).toBe(true);
  });

  it('returns the missing permissions in the forbidden response', () => {
    const guard = guardRequiring(
      Permission.InventoryRead,
      Permission.InventoryAdjust,
    );

    try {
      guard.canActivate(
        contextWithPermissions([Permission.InventoryRead]),
      );
      throw new Error('Expected the guard to reject the request');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(
        (error as ForbiddenException).getResponse(),
      ).toMatchObject({
        code: 'INSUFFICIENT_PERMISSIONS',
        details: {
          required: [Permission.InventoryAdjust],
        },
      });
    }
  });
});
