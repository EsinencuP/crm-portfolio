import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Prisma, User as PrismaUser } from "@prisma/client";
import type { Adapter, AdapterUser } from "next-auth/adapters";

// biome-ignore lint/suspicious/noImportCycles: Audit request actor is loaded after Prisma initialization.
import { prisma } from "@/lib/prisma";
import { defaultPipelineStages } from "@/lib/workspace-defaults";

const userFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

function toAdapterUser(user: Pick<PrismaUser, "id" | "name" | "email" | "role" | "avatarUrl">): AdapterUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    image: user.avatarUrl,
    // This CRM uses Credentials and Google, without email verification-token login.
    emailVerified: null,
  };
}

export function CRMPrismaAdapter(): Adapter {
  return {
    ...PrismaAdapter(prisma),
    async createUser(user) {
      const email = user.email.trim().toLowerCase();
      const created = await prisma.$transaction(async (tx) => {
        const account = await tx.user.create({
          data: { email, name: user.name ?? email, avatarUrl: user.image ?? user.avatarUrl ?? null },
          select: userFields,
        });
        const workspace = await tx.workspace.create({
          data: { name: `${account.name}'s Workspace`, slug: `personal-${account.id}` },
        });
        await tx.workspaceMember.create({
          data: { userId: account.id, workspaceId: workspace.id, role: "OWNER", isDefault: true },
        });
        await tx.pipelineStage.createMany({
          data: defaultPipelineStages.map((stage) => ({ ...stage, workspaceId: workspace.id })),
        });
        return account;
      });
      return toAdapterUser(created);
    },
    async getUser(id) {
      const user = await prisma.user.findUnique({ where: { id }, select: userFields });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByEmail(email) {
      const user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: userFields,
      });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByAccount(provider_providerAccountId) {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId },
        select: { user: { select: userFields } },
      });
      return account ? toAdapterUser(account.user) : null;
    },
    async updateUser({ id, name, email, image, avatarUrl }) {
      const user = await prisma.user.update({
        where: { id },
        data: {
          name: name ?? undefined,
          email: email?.trim().toLowerCase(),
          avatarUrl: image === undefined ? avatarUrl : image,
        },
        select: userFields,
      });
      return toAdapterUser(user);
    },
    async deleteUser(id) {
      const user = await prisma.user.delete({ where: { id }, select: userFields });
      return toAdapterUser(user);
    },
    async getSessionAndUser(sessionToken) {
      const result = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: { select: userFields } },
      });
      if (!result) return null;
      const { user, ...session } = result;
      return { session, user: toAdapterUser(user) };
    },
  };
}
