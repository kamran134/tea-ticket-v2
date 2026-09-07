import { execSync } from 'child_process';
import express from 'express';
import { Prisma } from '@prisma/client';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  createResendInboundWebhookHandler,
  type ResendInboundConfig,
  type ResendInboundDependencies,
} from '../src/routes/resend-inbound';
import { resetDatabase, seedSuperAdmin } from './helpers';

const prisma = new PrismaClient();
let app: ReturnType<typeof createApp>['app'];

const inboundConfig: ResendInboundConfig = {
  apiKey: '',
  webhookSecret: 'whsec_test',
  telegramBotToken: '',
  telegramChatId: '',
};

async function persistInboundEmailForTest(emailId: string): Promise<void> {
  try {
    await prisma.inboundEmail.create({
      data: { providerEmailId: emailId, isRead: false },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      return;
    }
    throw error;
  }
}

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

function createInboundTestApp(dependencies: ResendInboundDependencies) {
  const inboundApp = express();
  inboundApp.post(
    '/api/resend/inbound',
    express.raw({ type: 'application/json' }),
    createResendInboundWebhookHandler(prisma, inboundConfig, dependencies),
  );
  return inboundApp;
}

function webhookRequest(appInstance: express.Express, body: object) {
  return request(appInstance)
    .post('/api/resend/inbound')
    .set('content-type', 'application/json')
    .set('svix-id', 'msg_test')
    .set('svix-timestamp', '1770000000')
    .set('svix-signature', 'v1,test')
    .send(JSON.stringify(body));
}

describe('Inbound emails admin API', () => {
  it('returns 401 without auth', async () => {
    await request(app).get('/api/inbound-emails/unread-count').expect(401);
    await request(app).post('/api/inbound-emails/mark-all-read').expect(401);
  });

  it('returns unread count and marks all as read', async () => {
    const { token } = await seedSuperAdmin(prisma);
    await prisma.inboundEmail.createMany({
      data: [
        { providerEmailId: 'email_a', isRead: false },
        { providerEmailId: 'email_b', isRead: false },
        { providerEmailId: 'email_c', isRead: true },
      ],
    });

    const countRes = await request(app)
      .get('/api/inbound-emails/unread-count')
      .set(auth(token))
      .expect(200);
    expect(countRes.body.data.unreadCount).toBe(2);

    const markRes = await request(app)
      .post('/api/inbound-emails/mark-all-read')
      .set(auth(token))
      .expect(200);
    expect(markRes.body.data.markedCount).toBe(2);

    const afterRes = await request(app)
      .get('/api/inbound-emails/unread-count')
      .set(auth(token))
      .expect(200);
    expect(afterRes.body.data.unreadCount).toBe(0);
  });
});

describe('Inbound emails webhook persistence', () => {
  it('persists a row and is idempotent on retries', async () => {
    const dependencies: ResendInboundDependencies = {
      verifyWebhook: vi.fn().mockReturnValue({
        type: 'email.received',
        data: { email_id: 'email_persist_1' },
      }),
      persistInboundEmail: persistInboundEmailForTest,
      getReceivedEmail: vi.fn(),
      sendTelegramMessage: vi.fn(),
    };
    const inboundApp = createInboundTestApp(dependencies);

    await webhookRequest(inboundApp, {
      type: 'email.received',
      data: { email_id: 'email_persist_1' },
    }).expect(200);
    await webhookRequest(inboundApp, {
      type: 'email.received',
      data: { email_id: 'email_persist_1' },
    }).expect(200);

    const rows = await prisma.inboundEmail.findMany({
      where: { providerEmailId: 'email_persist_1' },
    });
    expect(rows).toHaveLength(1);
  });

  it('does not reset isRead when the same email_id is received again', async () => {
    const dependencies: ResendInboundDependencies = {
      verifyWebhook: vi.fn().mockReturnValue({
        type: 'email.received',
        data: { email_id: 'email_read_once' },
      }),
      persistInboundEmail: persistInboundEmailForTest,
      getReceivedEmail: vi.fn(),
      sendTelegramMessage: vi.fn(),
    };
    const inboundApp = createInboundTestApp(dependencies);

    await webhookRequest(inboundApp, {
      type: 'email.received',
      data: { email_id: 'email_read_once' },
    }).expect(200);

    await prisma.inboundEmail.updateMany({
      where: { providerEmailId: 'email_read_once' },
      data: { isRead: true },
    });

    await webhookRequest(inboundApp, {
      type: 'email.received',
      data: { email_id: 'email_read_once' },
    }).expect(200);

    const row = await prisma.inboundEmail.findUnique({
      where: { providerEmailId: 'email_read_once' },
    });
    expect(row?.isRead).toBe(true);
  });
});
