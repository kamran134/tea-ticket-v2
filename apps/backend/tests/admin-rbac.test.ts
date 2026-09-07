import { execSync } from 'child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { ErrorCodes } from '../src/errors';
import { signAdminToken } from '../src/middleware/auth';
import {
  resetDatabase,
  seedAdminUser,
  seedSuperAdmin,
  seedSystemRoles,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
} from './helpers';

const prisma = new PrismaClient();
let app: ReturnType<typeof createApp>['app'];

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
  app = createApp({ prisma }).app;
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function expectError(res: { status: number; body: { error?: { code?: string } } }, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body.error?.code).toBe(code);
}

describe('Auth', () => {
  it('logs in with email and password and returns the actor', async () => {
    await seedSuperAdmin(prisma);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD })
      .expect(200);

    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(TEST_ADMIN_EMAIL);
    expect(res.body.data.user.isSuperAdmin).toBe(true);
  });

  it('rejects a wrong password with a generic message', async () => {
    await seedSuperAdmin(prisma);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_ADMIN_EMAIL, password: 'definitely-wrong' })
      .expect(401);
    expectError(res, 401, ErrorCodes.UNAUTHORIZED);
    expect(res.body.error.message).toMatch(/email or password/i);
  });

  it('rejects an unknown email the same way, without leaking that the account is missing', async () => {
    await seedSuperAdmin(prisma);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: TEST_ADMIN_PASSWORD })
      .expect(401);
    expectError(res, 401, ErrorCodes.UNAUTHORIZED);
  });

  it('exposes /me and logs out by bumping tokenVersion', async () => {
    const { token } = await seedSuperAdmin(prisma);
    await request(app).get('/api/auth/me').set(auth(token)).expect(200);

    await request(app).post('/api/auth/logout').set(auth(token)).expect(200);

    const after = await request(app).get('/api/auth/me').set(auth(token));
    expectError(after, 401, ErrorCodes.UNAUTHORIZED);
  });
});

describe('Role access', () => {
  it('lets a Super Admin call any admin endpoint', async () => {
    const { token } = await seedSuperAdmin(prisma);
    await request(app).get('/api/admin-users').set(auth(token)).expect(200);
    await request(app).get('/api/roles').set(auth(token)).expect(200);
    await request(app).get('/api/audit-log').set(auth(token)).expect(200);
    await request(app).get('/api/tickets').set(auth(token)).expect(200);
  });

  it('lets a Viewer read events but not create them or manage users', async () => {
    await seedSystemRoles(prisma);
    const { token } = await seedAdminUser(prisma, {
      email: 'viewer@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'viewer',
    });

    await request(app).get('/api/venues?all=true').set(auth(token)).expect(200);

    const created = await request(app)
      .post('/api/venues')
      .set(auth(token))
      .send({ name: 'Nope', date: '2026-12-01T19:00:00.000Z' });
    expectError(created, 403, ErrorCodes.FORBIDDEN);

    const users = await request(app).get('/api/admin-users').set(auth(token));
    expectError(users, 403, ErrorCodes.FORBIDDEN);
  });

  it('lets a Manager confirm tickets but not delete them', async () => {
    await seedSystemRoles(prisma);
    const { token } = await seedAdminUser(prisma, {
      email: 'manager@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'manager',
    });

    const del = await request(app).delete('/api/tickets/does-not-matter').set(auth(token));
    expectError(del, 403, ErrorCodes.FORBIDDEN);

    // tickets.edit is granted — a missing ticket is 404, not 403.
    const status = await request(app)
      .patch('/api/tickets/does-not-matter/status')
      .set(auth(token))
      .send({ status: 'CONFIRMED' });
    expect(status.status).toBe(404);
  });

  it('lets an Admin delete tickets but not create users', async () => {
    await seedSystemRoles(prisma);
    const { token } = await seedAdminUser(prisma, {
      email: 'admin@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'admin',
    });

    const del = await request(app).delete('/api/tickets/does-not-matter').set(auth(token));
    expect(del.status).toBe(404);

    const created = await request(app)
      .post('/api/admin-users')
      .set(auth(token))
      .send({
        email: 'new@test.local',
        name: 'New',
        password: TEST_ADMIN_PASSWORD,
        roleId: 'whatever',
      });
    expectError(created, 403, ErrorCodes.FORBIDDEN);
  });
});

describe('Privilege escalation', () => {
  it('refuses to let a user change their own role or status', async () => {
    const owner = await seedSuperAdmin(prisma);
    await seedAdminUser(prisma, {
      email: 'second@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'super-admin',
      name: 'Second',
    });
    const viewerRole = await prisma.adminRole.findUniqueOrThrow({ where: { slug: 'viewer' } });

    const roleChange = await request(app)
      .patch(`/api/admin-users/${owner.id}`)
      .set(auth(owner.token))
      .send({ roleId: viewerRole.id });
    expectError(roleChange, 403, ErrorCodes.FORBIDDEN);

    const deactivate = await request(app)
      .patch(`/api/admin-users/${owner.id}`)
      .set(auth(owner.token))
      .send({ active: false });
    expectError(deactivate, 403, ErrorCodes.FORBIDDEN);
  });

  it('refuses to let a Super Admin delete themselves, even when they are the last one', async () => {
    const owner = await seedSuperAdmin(prisma);
    const second = await seedAdminUser(prisma, {
      email: 'second@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'super-admin',
    });

    await request(app)
      .delete(`/api/admin-users/${second.id}`)
      .set(auth(owner.token))
      .expect(200);

    const last = await request(app)
      .delete(`/api/admin-users/${owner.id}`)
      .set(auth(owner.token));
    expectError(last, 403, ErrorCodes.FORBIDDEN);
  });

  it('stops an account from granting a permission it does not hold', async () => {
    await seedSystemRoles(prisma);
    await prisma.adminRole.create({
      data: {
        slug: 'role-editor',
        name: 'Role editor',
        permissions: ['roles.view', 'roles.create', 'roles.edit'],
      },
    });
    const { token } = await seedAdminUser(prisma, {
      email: 'editor@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'role-editor',
    });

    const res = await request(app)
      .post('/api/roles')
      .set(auth(token))
      .send({ name: 'Elevated', permissions: ['users.delete'] });
    expectError(res, 403, ErrorCodes.FORBIDDEN);
  });

  it('invalidates existing tokens when a password is reset', async () => {
    const owner = await seedSuperAdmin(prisma);
    const target = await seedAdminUser(prisma, {
      email: 'target@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'viewer',
    });

    await request(app).get('/api/auth/me').set(auth(target.token)).expect(200);

    await request(app)
      .post(`/api/admin-users/${target.id}/password`)
      .set(auth(owner.token))
      .send({ password: 'brand-new-password' })
      .expect(200);

    const after = await request(app).get('/api/auth/me').set(auth(target.token));
    expectError(after, 401, ErrorCodes.UNAUTHORIZED);
  });

  it('rejects a token whose version no longer matches', async () => {
    const { id } = await seedSuperAdmin(prisma);
    const stale = signAdminToken(id, 99);
    const res = await request(app).get('/api/auth/me').set(auth(stale));
    expectError(res, 401, ErrorCodes.UNAUTHORIZED);
  });

  it('does not let anyone edit the Super Admin role', async () => {
    const { token } = await seedSuperAdmin(prisma);
    const role = await prisma.adminRole.findUniqueOrThrow({ where: { slug: 'super-admin' } });
    const res = await request(app)
      .patch(`/api/roles/${role.id}`)
      .set(auth(token))
      .send({ name: 'Renamed' });
    expectError(res, 403, ErrorCodes.FORBIDDEN);
  });

  it('does not let a non-owner assign the Super Admin role', async () => {
    await seedSystemRoles(prisma);
    await prisma.adminRole.create({
      data: {
        slug: 'hr',
        name: 'HR',
        permissions: ['users.view', 'users.create', 'users.edit'],
      },
    });
    const hr = await seedAdminUser(prisma, {
      email: 'hr@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'hr',
    });
    const superRole = await prisma.adminRole.findUniqueOrThrow({ where: { slug: 'super-admin' } });
    const res = await request(app)
      .post('/api/admin-users')
      .set(auth(hr.token))
      .send({
        email: 'promoted@test.local',
        name: 'Promoted',
        password: TEST_ADMIN_PASSWORD,
        roleId: superRole.id,
      });
    expectError(res, 403, ErrorCodes.FORBIDDEN);
  });
});
