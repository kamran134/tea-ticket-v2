import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env';
import { prisma } from '../db';
import { ErrorCodes, fail } from '../errors';
import { Actor, PermissionCode, can } from '../services/permissions';

export interface AdminTokenPayload {
  sub: string;
  /** Must match AdminUser.tokenVersion, otherwise the token was revoked. */
  ver: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

export function signAdminToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, ver: tokenVersion } satisfies AdminTokenPayload, env.JWT_SECRET, {
    expiresIn: '24h',
  });
}

/**
 * Resolves the admin behind the request and attaches it as req.actor.
 *
 * Permissions are read from the database on every request rather than baked
 * into the token, so a role change, a deactivation or a password reset takes
 * effect immediately instead of when the 24h token happens to expire.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    fail(res, 401, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
    return;
  }

  let payload: AdminTokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET) as AdminTokenPayload;
  } catch {
    fail(res, 401, ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
    return;
  }

  if (typeof payload?.sub !== 'string' || typeof payload?.ver !== 'number') {
    fail(res, 401, ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
    return;
  }

  let user;
  try {
    user = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
  } catch {
    fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to resolve session');
    return;
  }

  if (!user || !user.active || user.tokenVersion !== payload.ver) {
    fail(res, 401, ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
    return;
  }

  req.actor = toActor(user);
  next();
}

type AdminUserWithRole = {
  id: string;
  email: string;
  name: string;
  role: { id: string; slug: string; name: string; isSuperAdmin: boolean; permissions: string[] };
};

export function toActor(user: AdminUserWithRole): Actor {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleId: user.role.id,
    roleSlug: user.role.slug,
    roleName: user.role.name,
    isSuperAdmin: user.role.isSuperAdmin,
    permissions: new Set(user.role.permissions),
  };
}

/**
 * Declarative authorization for a route: `requirePermission('events.edit')`.
 * Always used after requireAuth, which is what puts req.actor in place.
 */
export function requirePermission(code: PermissionCode): RequestHandler {
  return (req, res, next) => {
    const actor = req.actor;
    if (!actor) {
      fail(res, 401, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
      return;
    }
    if (!can(actor, code)) {
      fail(res, 403, ErrorCodes.FORBIDDEN, `Missing permission: ${code}`);
      return;
    }
    next();
  };
}

/** req.actor for handlers that run behind requireAuth. */
export function actorOf(req: Request): Actor {
  const actor = req.actor;
  if (!actor) throw new Error('actorOf() called outside a requireAuth-protected route');
  return actor;
}
