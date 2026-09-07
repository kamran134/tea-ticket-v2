import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { ErrorCodes, fail, failZod, isTestMode } from '../errors';
import { actorOf, requireAuth, signAdminToken, toActor } from '../middleware/auth';
import { AuditActions, recordAudit } from '../services/audit';
import { Actor } from '../services/permissions';

export const authRouter = Router();

export const PASSWORD_MIN_LENGTH = 10;
export const BCRYPT_COST = 10;

// Slows brute force per client IP. Admin accounts are few and their emails are
// guessable, so this is the main barrier in front of the password check.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestMode(),
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts, please try again later' },
  },
});

/**
 * Compared against when the email does not exist, so a missing account costs
 * the same time as a wrong password and cannot be told apart by timing.
 */
const DUMMY_HASH = bcrypt.hashSync('password-that-is-never-valid', BCRYPT_COST);

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export function actorResponse(actor: Actor) {
  return {
    id: actor.id,
    email: actor.email,
    name: actor.name,
    role: {
      id: actor.roleId,
      slug: actor.roleSlug,
      name: actor.roleName,
      isSuperAdmin: actor.isSuperAdmin,
    },
    isSuperAdmin: actor.isSuperAdmin,
    permissions: [...actor.permissions],
  };
}

authRouter.post('/login', loginRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, 'Email and password are required');
  }
  const email = parsed.data.email.trim().toLowerCase();

  try {
    const user = await prisma.adminUser.findUnique({
      where: { email },
      include: { role: true },
    });

    const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

    // A disabled account is rejected exactly like a wrong password: no reason to
    // tell an attacker which of the two it was.
    if (!user || !user.active || !valid) {
      await recordAudit({
        action: AuditActions.LOGIN_FAILURE,
        actor: { email },
        req,
        metadata: { reason: !user ? 'unknown_email' : !user.active ? 'inactive' : 'bad_password' },
      });
      return fail(res, 401, ErrorCodes.UNAUTHORIZED, 'Invalid email or password');
    }

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const actor = toActor(user);
    await recordAudit({ action: AuditActions.LOGIN_SUCCESS, actor, req });

    return res.json({
      success: true,
      data: { token: signAdminToken(user.id, user.tokenVersion), user: actorResponse(actor) },
    });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Login failed');
  }
});

// GET /api/auth/me — the frontend's source of truth for what to render.
authRouter.get('/me', requireAuth, (req, res) => {
  return res.json({ success: true, data: actorResponse(actorOf(req)) });
});

/**
 * Bumping tokenVersion is what makes this a real logout: the token stays
 * syntactically valid until it expires, but requireAuth stops accepting it.
 */
authRouter.post('/logout', requireAuth, async (req, res) => {
  const actor = actorOf(req);
  try {
    await prisma.adminUser.update({
      where: { id: actor.id },
      data: { tokenVersion: { increment: 1 } },
    });
    await recordAudit({ action: AuditActions.LOGOUT, actor, req });
    return res.json({ success: true, data: { loggedOut: true } });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Logout failed');
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(200),
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return failZod(res, parsed.error);

  const actor = actorOf(req);
  try {
    const user = await prisma.adminUser.findUnique({ where: { id: actor.id } });
    if (!user) return fail(res, 401, ErrorCodes.UNAUTHORIZED, 'Unauthorized');

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      return fail(res, 400, ErrorCodes.VALIDATION_ERROR, 'Current password is incorrect');
    }

    // Invalidates every other session of this account as well.
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST),
        tokenVersion: { increment: 1 },
      },
    });
    await recordAudit({ action: AuditActions.PASSWORD_CHANGE, actor, req });

    const refreshed = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });
    return res.json({
      success: true,
      data: { token: signAdminToken(refreshed.id, refreshed.tokenVersion) },
    });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to change password');
  }
});
