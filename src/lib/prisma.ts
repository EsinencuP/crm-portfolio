import { PrismaClient } from "@prisma/client";

// Auth.js is loaded lazily by the audit hook after client initialization.
// biome-ignore lint/suspicious/noImportCycles: No auth module is evaluated during Prisma client construction.
import { withAuditLog } from "@/lib/audit-extension";

function createPrismaClient() {
  return withAuditLog(new PrismaClient());
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
