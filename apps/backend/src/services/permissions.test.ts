import { describe, expect, it } from 'vitest';
import {
  Actor,
  PERMISSION_CODES,
  PermissionCode,
  SUPER_ADMIN_ROLE_SLUG,
  SYSTEM_ROLES,
  can,
  canAll,
  isPermissionCode,
  permissionCatalog,
} from './permissions';

function actor(permissions: PermissionCode[], isSuperAdmin = false): Actor {
  return {
    id: 'u1',
    email: 'a@example.com',
    name: 'A',
    roleId: 'r1',
    roleSlug: 'test',
    roleName: 'Test',
    isSuperAdmin,
    permissions: new Set(permissions),
  };
}

describe('can()', () => {
  it('grants a permission that is on the list', () => {
    expect(can(actor(['events.view']), 'events.view')).toBe(true);
  });

  it('denies a permission that is not on the list', () => {
    expect(can(actor(['events.view']), 'events.delete')).toBe(false);
  });

  it('grants everything to a super admin even with an empty permission list', () => {
    const owner = actor([], true);
    for (const code of PERMISSION_CODES) {
      expect(can(owner, code)).toBe(true);
    }
  });

  it('canAll requires every code', () => {
    const a = actor(['events.view', 'events.edit']);
    expect(canAll(a, ['events.view', 'events.edit'])).toBe(true);
    expect(canAll(a, ['events.view', 'events.delete'])).toBe(false);
  });
});

describe('permission catalog', () => {
  it('has 18 codes and every code is resource.action', () => {
    expect(PERMISSION_CODES).toHaveLength(18);
    for (const code of PERMISSION_CODES) {
      expect(code).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });

  it('isPermissionCode rejects unknown strings', () => {
    expect(isPermissionCode('events.view')).toBe(true);
    expect(isPermissionCode('events.publish')).toBe(false);
    expect(isPermissionCode('__proto__')).toBe(false);
  });

  it('groups every code under exactly one resource', () => {
    const grouped = permissionCatalog().flatMap(g => g.permissions.map(p => p.code));
    expect(grouped.slice().sort()).toEqual(PERMISSION_CODES.slice().sort());
  });
});

describe('system role presets', () => {
  it('only super-admin carries the bypass flag and it needs no explicit permissions', () => {
    const superAdmins = SYSTEM_ROLES.filter(r => r.isSuperAdmin);
    expect(superAdmins).toHaveLength(1);
    expect(superAdmins[0].slug).toBe(SUPER_ADMIN_ROLE_SLUG);
    expect(superAdmins[0].permissions).toEqual([]);
  });

  it('every preset permission exists in the catalog', () => {
    for (const role of SYSTEM_ROLES) {
      for (const code of role.permissions) {
        expect(isPermissionCode(code)).toBe(true);
      }
    }
  });

  it('viewer can only read', () => {
    const viewer = SYSTEM_ROLES.find(r => r.slug === 'viewer')!;
    expect(viewer.permissions.every(code => code.endsWith('.view'))).toBe(true);
  });

  it('manager can work with tickets but not delete anything', () => {
    const manager = actor(SYSTEM_ROLES.find(r => r.slug === 'manager')!.permissions);
    expect(can(manager, 'tickets.edit')).toBe(true);
    expect(can(manager, 'tickets.checkin')).toBe(true);
    expect(can(manager, 'tickets.delete')).toBe(false);
    expect(can(manager, 'events.delete')).toBe(false);
    expect(can(manager, 'users.view')).toBe(false);
  });

  it('admin manages content but cannot manage roles or write users', () => {
    const admin = actor(SYSTEM_ROLES.find(r => r.slug === 'admin')!.permissions);
    expect(can(admin, 'events.delete')).toBe(true);
    expect(can(admin, 'tickets.delete')).toBe(true);
    expect(can(admin, 'users.view')).toBe(true);
    expect(can(admin, 'users.create')).toBe(false);
    expect(can(admin, 'users.delete')).toBe(false);
    expect(can(admin, 'roles.edit')).toBe(false);
  });
});
