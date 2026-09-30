import type { ReactNode } from "react";

import { SidebarInset } from "@/components/ui/sidebar";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

import { DashboardHeader } from "./_components/header/dashboard-header";
import { AppSidebar, AppSidebarProvider } from "./_components/sidebar/app-sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" }, select: { appName: true } });
  return (
    <AppSidebarProvider>
      <AppSidebar role={user.role} appName={settings?.appName ?? "CRM Portfolio"} />
      <SidebarInset className="min-w-0">
        <DashboardHeader currentRole={user.role} />
        <div className="min-w-0 flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </AppSidebarProvider>
  );
}
