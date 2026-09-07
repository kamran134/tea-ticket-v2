import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { Actor } from './permissions';

/**
 * Audit actions worth keeping. Reads are deliberately not logged — the trail
 * exists to answer "who changed this", not to record every page view.
 */
export const AuditActions = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGE: 'auth.password.change',

  USER_CREATE: 'users.create',
  USER_UPDATE: 'users.update',
  USER_DELETE: 'users.delete',
  USER_PASSWORD_RESET: 'users.password.reset',

  ROLE_CREATE: 'roles.create',
  ROLE_UPDATE: 'roles.update',
  ROLE_DELETE: 'roles.delete',

  VENUE_CREATE: 'events.create',
  VENUE_DELETE: 'events.delete',
  TICKET_STATUS: 'tickets.status',
  TICKET_DELETE: 'tickets.delete',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export interface AuditEntry {
  action: AuditAction;
  /** Who acted. A string is used for failed logins, where there is no account. */
  actor: Actor | { email: string };
  resource?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
  req?: Request;
}

/**
 * Writes one audit row. Never throws: losing an audit line must not turn a
 * successful action into a 500 for the operator.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const actorId = 'id' in entry.actor ? entry.actor.id : null;
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId,
        actorEmail: entry.actor.email,
        action: entry.action,
        resource: entry.resource ?? null,
        resourceId: entry.resourceId ?? null,
        metadata: entry.metadata,
        ip: entry.req?.ip ?? null,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log entry', entry.action, err);
  }
}
