import { AppError, ErrorCodes } from '../errors';
import { Actor, PermissionCode, isPermissionCode } from './permissions';

/**
 * Rules that stop an admin from ending up with more power than they were given.
 *
 * The whole set follows from one idea: you can never hand out — to a role, to
 * another account, or to yourself — a permission you do not already hold, and
 * you can never act on an account that outranks you. Super admins are exempt
 * because they hold everything by definition.
 */

export interface RoleLike {
  id: string;
  slug: string;
  permissions: string[];
  isSuperAdmin: boolean;
  isSystem: boolean;
}

export function assertKnownPermissions(codes: string[]): asserts codes is PermissionCode[] {
  const unknown = codes.filter(code => !isPermissionCode(code));
  if (unknown.length > 0) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown permission code: ${unknown[0]}`,
      400,
    );
  }
}

/** No granting what you do not hold yourself. */
export function assertCanGrant(actor: Actor, codes: readonly string[]): void {
  if (actor.isSuperAdmin) return;
  const missing = codes.filter(code => !actor.permissions.has(code));
  if (missing.length > 0) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      `You cannot grant a permission you do not have: ${missing[0]}`,
      403,
    );
  }
}

/** Only a super admin may touch the super admin role or hand it out. */
export function assertCanAssignRole(actor: Actor, role: RoleLike): void {
  if (role.isSuperAdmin && !actor.isSuperAdmin) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Only a Super Admin can assign the Super Admin role', 403);
  }
  assertCanGrant(actor, role.permissions);
}

/**
 * An account whose role grants more than yours is out of reach: otherwise
 * `users.edit` alone would let you reset a stronger admin's password and log
 * in as them.
 */
export function assertCanManageUser(actor: Actor, targetRole: RoleLike): void {
  if (targetRole.isSuperAdmin && !actor.isSuperAdmin) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Only a Super Admin can manage a Super Admin account', 403);
  }
  if (actor.isSuperAdmin) return;
  const beyond = targetRole.permissions.filter(code => !actor.permissions.has(code));
  if (beyond.length > 0) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      'You cannot manage an account with permissions you do not have',
      403,
    );
  }
}

export function assertNotSelf(actor: Actor, targetId: string, message: string): void {
  if (actor.id === targetId) {
    throw new AppError(ErrorCodes.FORBIDDEN, message, 403);
  }
}
