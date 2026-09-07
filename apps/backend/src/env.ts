import { z } from 'zod';

// Validated once at startup — imported by index.ts right after dotenv.config().
// Without this, a missing JWT_SECRET used to surface as confusing runtime
// symptoms instead (jwt.sign throwing on /login, jwt.verify rejecting every
// admin request with a plain "Invalid or expired token"), and a missing
// DATABASE_URL would fail deep inside Prisma on the first query. Both are
// required for the app to function at all, so fail fast with a clear message
// instead of leaving an operator to diagnose by symptom.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  // Only read on a database with no admin accounts, to create the first Super
  // Admin (see services/bootstrap-admin.ts). Empty string is treated as unset
  // so compose files can pass ADMIN_EMAIL: ${ADMIN_EMAIL:-} without crashing.
  ADMIN_EMAIL: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email('ADMIN_EMAIL must be a valid email').optional(),
  ),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
