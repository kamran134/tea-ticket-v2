import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError, ErrorCodes, fail, failApp, failZod } from '../errors';
import { actorOf, requireAuth, requirePermission } from '../middleware/auth';
import { AuditActions, recordAudit } from '../services/audit';
import { assertCanGrant, assertKnownPermissions } from '../services/admin-guards';
import { permissionCatalog } from '../services/permissions';

export const rolesRouter = Router();

// The permission catalog. Any signed-in admin may read it — it is a static list
// of code names used to render the role editor, not data.
export const permissionsRouter = Router();
permissionsRouter.get('/', requireAuth, (_req, res) => {
  return res.json({ success: true, data: permissionCatalog() });
});

const roleView = {
  id: true,
  slug: true,
  name: true,
  description: true,
  permissions: true,
  isSystem: true,
  isSuperAdmin: true,
  createdAt: true,
  _count: { select: { users: true } },
} as const;

function toRoleDto(role: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  isSuperAdmin: boolean;
  createdAt: Date;
  _count: { users: number };
}) {
  const { _count, ...rest } = role;
  return { ...rest, userCount: _count.users };
}

function slugifyRoleName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

rolesRouter.get('/', requireAuth, requirePermission('roles.view'), async (_req, res) => {
  try {
    const roles = await prisma.adminRole.findMany({
      select: roleView,
      orderBy: [{ isSuperAdmin: 'desc' }, { isSystem: 'desc' }, { name: 'asc' }],
    });
    return res.json({ success: true, data: roles.map(toRoleDto) });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch roles');
  }
});

const createRoleSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).nullish(),
  permissions: z.array(z.string()).max(100),
});

rolesRouter.post('/', requireAuth, requirePermission('roles.create'), async (req, res) => {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) return failZod(res, parsed.error);

  const actor = actorOf(req);
  try {
    const permissions = [...new Set(parsed.data.permissions)];
    assertKnownPermissions(permissions);
    assertCanGrant(actor, permissions);

    const slug = slugifyRoleName(parsed.data.name);
    if (!slug) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Role name must contain latin letters or digits', 400);
    }
    if (await prisma.adminRole.findUnique({ where: { slug } })) {
      throw new AppError(ErrorCodes.CONFLICT, 'A role with this name already exists', 409);
    }

    const role = await prisma.adminRole.create({
      data: {
        slug,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        permissions,
      },
      select: roleView,
    });
    await recordAudit({
      action: AuditActions.ROLE_CREATE,
      actor,
      req,
      resource: 'role',
      resourceId: role.id,
      metadata: { name: role.name, permissions },
    });
    return res.status(201).json({ success: true, data: toRoleDto(role) });
  } catch (err) {
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to create role');
  }
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(300).nullish(),
  permissions: z.array(z.string()).max(100).optional(),
});

rolesRouter.patch('/:id', requireAuth, requirePermission('roles.edit'), async (req, res) => {
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) return failZod(res, parsed.error);

  const actor = actorOf(req);
  try {
    const role = await prisma.adminRole.findUnique({ where: { id: req.params.id } });
    if (!role) throw new AppError(ErrorCodes.NOT_FOUND, 'Role not found', 404);

    // The super admin role is structural: it bypasses the permission list, so
    // editing that list would be meaningless, and renaming it only invites
    // confusion about which role is the protected one.
    if (role.isSuperAdmin) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'The Super Admin role cannot be modified', 403);
    }

    let permissions: string[] | undefined;
    if (parsed.data.permissions) {
      permissions = [...new Set(parsed.data.permissions)];
      assertKnownPermissions(permissions);
      // Only the codes being added need the check — removing a permission is a
      // downgrade and cannot be used to gain anything.
      assertCanGrant(actor, permissions.filter(code => !role.permissions.includes(code)));
    }

    const updated = await prisma.adminRole.update({
      where: { id: role.id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description?.trim() || null,
        }),
        ...(permissions !== undefined && { permissions }),
      },
      select: roleView,
    });
    await recordAudit({
      action: AuditActions.ROLE_UPDATE,
      actor,
      req,
      resource: 'role',
      resourceId: role.id,
      metadata: { name: updated.name, permissions: updated.permissions },
    });
    return res.json({ success: true, data: toRoleDto(updated) });
  } catch (err) {
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to update role');
  }
});

rolesRouter.delete('/:id', requireAuth, requirePermission('roles.delete'), async (req, res) => {
  const actor = actorOf(req);
  try {
    const role = await prisma.adminRole.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new AppError(ErrorCodes.NOT_FOUND, 'Role not found', 404);
    if (role.isSystem) {
      throw new AppError(ErrorCodes.CONFLICT, 'Preset roles cannot be deleted', 409);
    }
    if (role._count.users > 0) {
      throw new AppError(
        ErrorCodes.CONFLICT,
        'Role is assigned to users — reassign them before deleting it',
        409,
      );
    }

    await prisma.adminRole.delete({ where: { id: role.id } });
    await recordAudit({
      action: AuditActions.ROLE_DELETE,
      actor,
      req,
      resource: 'role',
      resourceId: role.id,
      metadata: { name: role.name },
    });
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to delete role');
  }
});
