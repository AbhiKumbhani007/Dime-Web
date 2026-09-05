import 'server-only'
import { PrismaClient } from '@prisma/client'

// DATABASE_URL must stay pointed at the same physical database dime-api uses
// during the backend-merge transition — ported and not-yet-ported modules
// read/write the same rows. Pointing this at a different database silently
// diverges the two systems instead of failing loudly.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
