CREATE TYPE "PermissionLevel" AS ENUM ('VIEW', 'EDIT', 'FULL', 'NONE');

CREATE TABLE "RecordPermission" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "PermissionLevel" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordPermission_workspaceId_entityType_entityId_userId_key" ON "RecordPermission"("workspaceId", "entityType", "entityId", "userId");
CREATE INDEX "RecordPermission_workspaceId_entityType_entityId_idx" ON "RecordPermission"("workspaceId", "entityType", "entityId");
CREATE INDEX "RecordPermission_userId_idx" ON "RecordPermission"("userId");

ALTER TABLE "RecordPermission" ADD CONSTRAINT "RecordPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordPermission" ADD CONSTRAINT "RecordPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecordPermission" ADD CONSTRAINT "RecordPermission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
