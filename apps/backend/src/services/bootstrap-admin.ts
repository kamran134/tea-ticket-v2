import type { PrismaClient } from '@prisma/client';
import { SUPER_ADMIN_ROLE_SLUG, SYSTEM_ROLES } from './permissions';

/**
 * Makes sure the four preset roles exist and that somebody can actually log in.
 *
 * Runs on every boot but is idempotent: existing roles are left alone (an admin
 * may have edited their permissions on purpose), and the owner account is only
 * created when there is no admin at all — that is, on the very first start
 * after this migration, or after someone deleted every account by hand.
 */
export async function ensureBootstrapAdmin(prisma: PrismaClient): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.adminRole.findUnique({ where: { slug: role.slug } });
    if (!existing) {
      await prisma.adminRole.create({
        data: {
          slug: role.slug,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          isSystem: true,
          isSuperAdmin: role.isSuperAdmin,
        },
      });
      continue;
    }
    // The bypass flag and system marker are structural, not editable settings —
    // repair them if a row was tampered with, but never touch the permissions
    // of an editable role.
    if (existing.isSystem !== true || existing.isSuperAdmin !== role.isSuperAdmin) {
      await prisma.adminRole.update({
        where: { id: existing.id },
        data: { isSystem: true, isSuperAdmin: role.isSuperAdmin },
      });
    }
  }

  const adminCount = await prisma.adminUser.count();
  if (adminCount > 0) return;

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  // Already a bcrypt hash — the owner password never exists in plaintext here.
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (!email || !passwordHash) {
    console.warn(
      'No admin accounts exist and ADMIN_EMAIL/ADMIN_PASSWORD_HASH are not both set — ' +
        'nobody can log in. Set both and restart to create the first Super Admin.',
    );
    return;
  }

  const superAdminRole = await prisma.adminRole.findUniqueOrThrow({
    where: { slug: SUPER_ADMIN_ROLE_SLUG },
  });

  await prisma.adminUser.create({
    data: {
      email,
      name: 'Owner',
      passwordHash,
      roleId: superAdminRole.id,
    },
  });

  console.log(`Created the first Super Admin account: ${email}`);
}
