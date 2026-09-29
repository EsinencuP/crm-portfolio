import type { ReactNode } from "react";

import { SidebarInset } from "@/components/ui/sidebar";

import { DashboardHeader } from "./_components/header/dashboard-header";
import { AppSidebar, AppSidebarProvider } from "./_components/sidebar/app-sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppSidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <DashboardHeader />
        <div className="min-w-0 flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </AppSidebarProvider>
  );
}
