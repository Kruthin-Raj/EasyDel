import { PrismaClient } from '@prisma/client';

/**
 * Single PrismaClient per process.
 *
 * Next dev hot-reloads modules, which would otherwise open a new pool on every
 * edit and exhaust Supabase's connection limit — hence the global cache.
 * Imports @prisma/client directly rather than the @delivery/database workspace
 * package, which exports raw TS and would need transpilePackages.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
