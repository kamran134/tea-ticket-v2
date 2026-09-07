/**
 * The permission catalog is the single source of truth for authorization.
 *
 * Codes are `resource.action` and are referenced literally by routes through
 * requirePermission(), so they live in code rather than in a table — a
 * `permissions` table would need a migration for every new code and could
 * silently drift from what the routes actually check.
 */

export const RESOURCES = ['events', 'tickets', 'stats', 'users', 'roles', 'audit'] as const;

export type Resource = (typeof RESOURCES)[number];

export const PERMISSIONS = {
  // Venues, zones, grid layout and grid templates — everything that makes up an event.
  'events.view': { resource: 'events', label: 'Просмотр мероприятий' },
  'events.create': { resource: 'events', label: 'Создание мероприятий' },
  'events.edit': { resource: 'events', label: 'Редактирование мероприятий и схемы зала' },
  'events.delete': { resource: 'events', label: 'Удаление мероприятий и шаблонов' },

  // No tickets.create: tickets are created by buyers through the public route.
  'tickets.view': { resource: 'tickets', label: 'Просмотр билетов' },
  'tickets.edit': { resource: 'tickets', label: 'Подтверждение и отклонение билетов' },
  'tickets.delete': { resource: 'tickets', label: 'Удаление билетов' },
  'tickets.checkin': { resource: 'tickets', label: 'Отметка о приходе (сканер)' },

  'stats.view': { resource: 'stats', label: 'Просмотр статистики и выручки' },

  'users.view': { resource: 'users', label: 'Просмотр пользователей' },
  'users.create': { resource: 'users', label: 'Создание пользователей' },
  'users.edit': { resource: 'users', label: 'Редактирование пользователей' },
  'users.delete': { resource: 'users', label: 'Удаление пользователей' },

  'roles.view': { resource: 'roles', label: 'Просмотр ролей' },
  'roles.create': { resource: 'roles', label: 'Создание ролей' },
  'roles.edit': { resource: 'roles', label: 'Редактирование ролей' },
  'roles.delete': { resource: 'roles', label: 'Удаление ролей' },

  'audit.view': { resource: 'audit', label: 'Просмотр журнала действий' },
} as const satisfies Record<string, { resource: Resource; label: string }>;

export type PermissionCode = keyof typeof PERMISSIONS;

export const PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

export function isPermissionCode(value: string): value is PermissionCode {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/** Catalog grouped by resource — shape consumed by GET /api/permissions. */
export function permissionCatalog(): {
  resource: Resource;
  permissions: { code: PermissionCode; label: string }[];
}[] {
  return RESOURCES.map(resource => ({
    resource,
    permissions: PERMISSION_CODES.filter(code => PERMISSIONS[code].resource === resource).map(
      code => ({ code, label: PERMISSIONS[code].label }),
    ),
  }));
}

/** The authenticated admin behind the current request, resolved by requireAuth. */
export interface Actor {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
  isSuperAdmin: boolean;
  permissions: ReadonlySet<string>;
}

/**
 * The only authorization primitive in the system. Super admins bypass the list
 * entirely so a newly added permission can never lock the owner out.
 */
export function can(actor: Actor, code: PermissionCode): boolean {
  return actor.isSuperAdmin || actor.permissions.has(code);
}

export function canAll(actor: Actor, codes: readonly PermissionCode[]): boolean {
  return codes.every(code => can(actor, code));
}

export const SUPER_ADMIN_ROLE_SLUG = 'super-admin';

/**
 * Roles seeded on first boot. Only super-admin is immutable; the rest are
 * ordinary editable rows and exist purely as sensible starting points.
 */
export const SYSTEM_ROLES: {
  slug: string;
  name: string;
  description: string;
  permissions: PermissionCode[];
  isSuperAdmin: boolean;
}[] = [
  {
    slug: SUPER_ADMIN_ROLE_SLUG,
    name: 'Super Admin',
    description: 'Полный доступ ко всем разделам и действиям без исключений',
    permissions: [],
    isSuperAdmin: true,
  },
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Мероприятия и билеты целиком, просмотр пользователей и журнала',
    permissions: [
      'events.view',
      'events.create',
      'events.edit',
      'events.delete',
      'tickets.view',
      'tickets.edit',
      'tickets.delete',
      'tickets.checkin',
      'stats.view',
      'users.view',
      'audit.view',
    ],
    isSuperAdmin: false,
  },
  {
    slug: 'manager',
    name: 'Manager',
    description: 'Ведение мероприятий и работа с билетами без удаления',
    permissions: [
      'events.view',
      'events.create',
      'events.edit',
      'tickets.view',
      'tickets.edit',
      'tickets.checkin',
      'stats.view',
    ],
    isSuperAdmin: false,
  },
  {
    slug: 'viewer',
    name: 'Viewer',
    description: 'Только просмотр',
    permissions: ['events.view', 'tickets.view', 'stats.view'],
    isSuperAdmin: false,
  },
];
