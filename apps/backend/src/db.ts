import { PrismaClient } from '@prisma/client';

// A single shared connection pool for the whole process — each route file
// used to construct its own PrismaClient, opening its own pool (~9 idle
// connections each by default) for no reason.
export const prisma = new PrismaClient();
