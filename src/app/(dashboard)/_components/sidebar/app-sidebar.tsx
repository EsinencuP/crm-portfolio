"use client";

import { type ComponentProps, useEffect } from "react";

import Link from "next/link";

import type { Role } from "@prisma/client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSidebarStore } from "@/stores/sidebar-store";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

// Place this provider around AppSidebar and the dashboard content so triggers share the Zustand state.
export function AppSidebarProvider({
  children,
  ...props
}: Omit<ComponentProps<typeof SidebarProvider>, "open" | "onOpenChange" | "defaultOpen">) {
  const collapsed = useSidebarStore((state) => state.collapsed);
  const setCollapsed = useSidebarStore((state) => state.setCollapsed);

  useEffect(() => {
    if (!useSidebarStore.persist.hasHydrated()) void useSidebarStore.persist.rehydrate();
  }, []);

  return (
    <SidebarProvider {...props} open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
      {children}
    </SidebarProvider>
  );
}

export function AppSidebar({
  role,
  appName,
  ...props
}: Omit<ComponentProps<typeof Sidebar>, "collapsible" | "children"> & { role: Role; appName: string }) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar {...props} collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <Link
                  href="/dashboard"
                  prefetch={false}
                  aria-label={`${appName} dashboard`}
                  onNavigate={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                />
              }
              className="group-data-[collapsible=icon]:p-0!"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-[10px] text-sidebar-primary-foreground">
                CRM
              </span>
              <span className="truncate font-semibold text-base group-data-[collapsible=icon]:hidden">{appName}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain role={role} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser currentRole={role} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
