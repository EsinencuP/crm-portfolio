"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { WorkspaceRole } from "@prisma/client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { type SidebarNavGroup, sidebarGroups } from "./sidebar-config";

export function NavMain({
  role,
  groups = sidebarGroups,
}: {
  role: WorkspaceRole;
  groups?: readonly SidebarNavGroup[];
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const visibleGroups = groups
    .filter((group) => group.id !== "settings" || role === "OWNER" || role === "ADMIN" || role === "MANAGER")
    .map((group) =>
      group.id === "settings" && role === "MANAGER"
        ? {
            ...group,
            items: group.items.filter(
              (item) =>
                !["/dashboard/settings", "/dashboard/settings/workspace", "/dashboard/settings/messaging"].includes(
                  item.url,
                ),
            ),
          }
        : {
            ...group,
            items: group.items.filter(
              (item) => item.url !== "/dashboard/forms" || ["OWNER", "ADMIN", "MANAGER"].includes(role),
            ),
          },
    );
  const activeItem = visibleGroups
    .flatMap((group) => group.items)
    .filter(({ url }) => pathname === url || (url !== "/dashboard" && pathname.startsWith(`${url}/`)))
    .sort((a, b) => b.url.length - a.url.length)[0];

  return (
    <nav aria-label="CRM navigation">
      {visibleGroups.map((group) => (
        <SidebarGroup key={group.id}>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
            {group.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    render={
                      <Link
                        href={item.url}
                        prefetch={false}
                        aria-label={item.title}
                        aria-current={activeItem?.url === item.url ? "page" : undefined}
                        onNavigate={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      />
                    }
                    isActive={activeItem?.url === item.url}
                    tooltip={item.title}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}
