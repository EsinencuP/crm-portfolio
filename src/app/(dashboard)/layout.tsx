import type { ReactNode } from "react";

import { SidebarInset } from "@/components/ui/sidebar";
import { requireAuth } from "@/lib/auth-utils";
import { getActiveWorkspaceMember } from "@/lib/workspace";

import { DashboardHeader } from "./_components/header/dashboard-header";
import { AppSidebar, AppSidebarProvider } from "./_components/sidebar/app-sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  const member = await getActiveWorkspaceMember(user.id);
  return (
    <AppSidebarProvider>
      <AppSidebar role={member?.role ?? "VIEWER"} appName={member?.workspace.name ?? "CRM Portfolio"} />
      <SidebarInset className="min-w-0">
        <DashboardHeader currentRole={member?.role ?? "VIEWER"} />
        <div className="min-w-0 flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </AppSidebarProvider>
  );
}
