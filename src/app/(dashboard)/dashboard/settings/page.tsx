import { requireRole } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

import { GeneralSettingsForm } from "./_components/general-settings-form";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  await requireRole(["ADMIN"]);
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">General settings</h1>
        <p className="text-muted-foreground">Set the CRM name and default time zone for your team.</p>
      </div>
      <GeneralSettingsForm
        initial={{ appName: settings?.appName ?? "CRM Portfolio", timezone: settings?.timezone ?? "UTC" }}
      />
    </div>
  );
}
