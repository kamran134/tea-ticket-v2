import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError, ErrorCodes, fail, failApp, failZod } from '../errors';
import { actorOf, requireAuth, requirePermission } from '../middleware/auth';
import { AuditActions, recordAudit } from '../services/audit';
import {
  assertCanAssignRole,
  assertCanManageUser,
  assertNotSelf,
} from '../services/admin-guards';
import { BCRYPT_COST, PASSWORD_MIN_LENGTH } from './auth';

export const adminUsersRouter = Router();

const userView = {
  id: true,
  email: true,
  name: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, slug: true, name: true, isSuperAdmin: true } },
} as const;

const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(200);

/**
 * Refuses to leave the system without anyone who can administer it. Called
 * before deactivating or deleting a super admin.
 */
async function assertNotLastSuperAdmin(userId: string): Promise<void> {
  const remaining = await prisma.adminUser.count({
    where: { active: true, id: { not: userId }, role: { isSuperAdmin: true } },
  });
  if (remaining === 0) {
    throw new AppError(ErrorCodes.CONFLICT, 'The last active Super Admin cannot be removed', 409);
  }
}

adminUsersRouter.get('/', requireAuth, requirePermission('users.view'), async (_req, res) => {
  try {
    const users = await prisma.adminUser.findMany({
      select: userView,
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });
    return res.json({ success: true, data: users });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch users');
  }
});

const createUserSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(100),
  password: passwordField,
  roleId: z.string().min(1),
  active: z.boolean().optional(),
});

adminUsersRouter.post('/', requireAuth, requirePermission('users.create'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return failZod(res, parsed.error);

  const actor = actorOf(req);
  const email = parsed.data.email.trim().toLowerCase();
  try {
    const role = await prisma.adminRole.findUnique({ where: { id: parsed.data.roleId } });
    if (!role) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Role not found', 400);
    assertCanAssignRole(actor, role);

    if (await prisma.adminUser.findUnique({ where: { email } })) {
      throw new AppError(ErrorCodes.CONFLICT, 'An account with this email already exists', 409);
    }

    const user = await prisma.adminUser.create({
      data: {
        email,
        name: parsed.data.name.trim(),
        passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_COST),
        roleId: role.id,
        active: parsed.data.active ?? true,
      },
      select: userView,
    });
    await recordAudit({
      action: AuditActions.USER_CREATE,
      actor,
      req,
      resource: 'user',
      resourceId: user.id,
      metadata: { email, role: role.slug },
    });
    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to create user');
  }
});

const updateUserSchema = z.object({
  email: z.string().email().max(200).optional(),
  name: z.string().min(1).max(100).optional(),
  roleId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

adminUsersRouter.patch('/:id', requireAuth, requirePermission('users.edit'), async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return failZod(res, parsed.error);

  const actor = actorOf(req);
  try {
    const target = await prisma.adminUser.findUnique({
      where: { id: req.params.id },
      include: { role: true },
    });
    if (!target) throw new AppError(ErrorCodes.NOT_FOUND, 'User not found', 404);
    assertCanManageUser(actor, target.role);

    // Changing your own role or switching yourself off is the most direct
    // escalation route there is, so it is refused for everyone including the
    // owner: another Super Admin has to do it.
    if (parsed.data.roleId !== undefined && parsed.data.roleId !== target.roleId) {
      assertNotSelf(actor, target.id, 'You cannot change your own role');
    }
    if (parsed.data.active !== undefined && parsed.data.active !== target.active) {
      assertNotSelf(actor, target.id, 'You cannot change your own account status');
    }

    let nextRoleId: string | undefined;
    if (parsed.data.roleId !== undefined && parsed.data.roleId !== target.roleId) {
      const role = await prisma.adminRole.findUnique({ where: { id: parsed.data.roleId } });
      if (!role) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Role not found', 400);
      assertCanAssignRole(actor, role);
      if (target.role.isSuperAdmin && !role.isSuperAdmin) {
        await assertNotLastSuperAdmin(target.id);
      }
      nextRoleId = role.id;
    }

    if (parsed.data.active === false && target.active && target.role.isSuperAdmin) {
      await assertNotLastSuperAdmin(target.id);
    }

    let email: string | undefined;
    if (parsed.data.email !== undefined) {
      email = parsed.data.email.trim().toLowerCase();
      const clash = await prisma.adminUser.findUnique({ where: { email } });
      if (clash && clash.id !== target.id) {
        throw new AppError(ErrorCodes.CONFLICT, 'An account with this email already exists', 409);
      }
    }

    // A role swap or a deactivation must not leave the old sessions usable.
    const revoke = nextRoleId !== undefined || parsed.data.active === false;

    const user = await prisma.adminUser.update({
      where: { id: target.id },
      data: {
        ...(email !== undefined && { email }),
        ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
        ...(nextRoleId !== undefined && { roleId: nextRoleId }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(revoke && { tokenVersion: { increment: 1 } }),
      },
      select: userView,
    });
    await recordAudit({
      action: AuditActions.USER_UPDATE,
      actor,
      req,
      resource: 'user',
      resourceId: user.id,
      metadata: {
        email: user.email,
        role: user.role.slug,
        active: user.active,
      },
    });
    return res.json({ success: true, data: user });
  } catch (err) {
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to update user');
  }
});

const resetPasswordSchema = z.object({ password: passwordField });

// Resetting someone else's password. Own password goes through
// POST /api/auth/change-password, which requires the current one.
adminUsersRouter.post(
  '/:id/password',
  requireAuth,
  requirePermission('users.edit'),
  async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return failZod(res, parsed.error);

    const actor = actorOf(req);
    try {
      const target = await prisma.adminUser.findUnique({
        where: { id: req.params.id },
        include: { role: true },
      });
      if (!target) throw new AppError(ErrorCodes.NOT_FOUND, 'User not found', 404);
      assertNotSelf(actor, target.id, 'Use change-password to set your own password');
      assertCanManageUser(actor, target.role);

      await prisma.adminUser.update({
        where: { id: target.id },
        data: {
          passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_COST),
          tokenVersion: { increment: 1 },
        },
      });
      await recordAudit({
        action: AuditActions.USER_PASSWORD_RESET,
        actor,
        req,
        resource: 'user',
        resourceId: target.id,
        metadata: { email: target.email },
      });
      return res.json({ success: true, data: { updated: true } });
    } catch (err) {
      if (err instanceof AppError) return failApp(res, err);
      return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to reset password');
    }
  },
);

adminUsersRouter.delete('/:id', requireAuth, requirePermission('users.delete'), async (req, res) => {
  const actor = actorOf(req);
  try {
    const target = await prisma.adminUser.findUnique({
      where: { id: req.params.id },
      include: { role: true },
    });
    if (!target) throw new AppError(ErrorCodes.NOT_FOUND, 'User not found', 404);
    assertNotSelf(actor, target.id, 'You cannot delete your own account');
    assertCanManageUser(actor, target.role);
    if (target.role.isSuperAdmin) {
      await assertNotLastSuperAdmin(target.id);
    }

    // Audit rows keep actorEmail and drop actorId (onDelete: SetNull), so the
    // trail of what this account did stays readable after the account is gone.
    await prisma.adminUser.delete({ where: { id: target.id } });
    await recordAudit({
      action: AuditActions.USER_DELETE,
      actor,
      req,
      resource: 'user',
      resourceId: target.id,
      metadata: { email: target.email },
    });
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to delete user');
  }
});
