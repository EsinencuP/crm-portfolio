"use client";

import { Fragment } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { NavUser as UserMenu } from "../sidebar/nav-user";
import { sidebarGroups } from "../sidebar/sidebar-config";
import { NotificationsButton } from "./notifications-button";
import { SearchDialog } from "./search-dialog";
import { ThemeSwitcher } from "./theme-switcher";

const routeLabels = new Map(
  sidebarGroups.flatMap(({ items }) => items.map(({ url, title }) => [url, title] as [string, string])),
);
routeLabels.set("/dashboard/settings/profile", "Profile");

function segmentLabel(segment: string, index: number, segments: string[]) {
  if (segment === "new") return "New";
  if (segment === "edit") return "Edit";
  if (index === 2 && ["contacts", "companies", "deals"].includes(segments[1])) return "Details";
  try {
    return decodeURIComponent(segment)
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return "Details";
  }
}

export function DashboardHeader() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((segment, index) => {
    const url = `/${segments.slice(0, index + 1).join("/")}`;
    return { url, label: routeLabels.get(url) ?? segmentLabel(segment, index, segments) };
  });

  return (
    <header className="relative flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background px-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="size-11 shrink-0" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <Fragment key={crumb.url}>
                  {index > 0 && <BreadcrumbSeparator className="hidden shrink-0 sm:block" />}
                  <BreadcrumbItem className={isLast ? "min-w-0" : "hidden shrink-0 sm:inline-flex"}>
                    {isLast ? (
                      <BreadcrumbPage className="truncate" title={crumb.label}>
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={crumb.url} prefetch={false} />}>{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <SearchDialog />
        <ThemeSwitcher />
        <NotificationsButton />
        <UserMenu variant="header" />
      </div>
    </header>
  );
}
