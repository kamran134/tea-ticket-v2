import { prisma } from '../db';
import { AppError, ErrorCodes } from '../errors';
import type { Actor } from './permissions';

/**
 * Super Admin sees every event. Everyone else only sees events they created.
 * A null createdById (legacy row with no owner) is visible to Super Admin only.
 */
export function canAccessVenue(actor: Actor, createdById: string | null): boolean {
  return actor.isSuperAdmin || createdById === actor.id;
}

export function assertVenueAccess(actor: Actor, createdById: string | null): void {
  if (canAccessVenue(actor, createdById)) return;
  throw new AppError(ErrorCodes.FORBIDDEN, 'You do not have access to this event', 403);
}

/** Narrows admin list queries to the actor's own events. Empty for Super Admin. */
export function venueOwnerWhere(actor: Actor): { createdById: string } | Record<string, never> {
  if (actor.isSuperAdmin) return {};
  return { createdById: actor.id };
}

export async function loadOwnedVenue(
  venueId: string,
  actor: Actor,
): Promise<{ id: string; createdById: string | null }> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, createdById: true },
  });
  if (!venue) {
    throw new AppError(ErrorCodes.EVENT_NOT_FOUND, 'Venue not found', 404);
  }
  assertVenueAccess(actor, venue.createdById);
  return venue;
}
