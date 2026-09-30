const { loadEnvConfig } = require("@next/env");
const { Prisma, PrismaClient } = require("@prisma/client");

loadEnvConfig(process.cwd());

const email = process.argv[2]?.trim().toLowerCase();
if (!email?.includes("@")) {
  console.error("Usage: npm run bootstrap:admin -- user@example.com");
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient();
  prisma
    .$transaction(
      async (tx) => {
        const existingAdmins = await tx.user.count({ where: { role: "ADMIN" } });
        if (existingAdmins > 0) throw new Error("An admin already exists. Use Team & roles to change roles.");
        const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (!user) throw new Error("Register this email in the CRM before bootstrapping admin access.");
        await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    .then(() => console.log("Initial admin access granted to the specified account."))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Unable to bootstrap admin access.");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
