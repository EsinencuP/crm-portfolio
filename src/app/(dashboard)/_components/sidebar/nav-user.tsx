"use client";

import { useState } from "react";

import Link from "next/link";

import { CircleUser, EllipsisVertical, LoaderCircle, LogOut, Settings } from "lucide-react";
import type { Session } from "next-auth";
import { signOut, useSession } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getInitials } from "@/lib/utils";

const roleLabels: Record<Session["user"]["role"], string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

function UserAvatar({ user }: { user: Session["user"] }) {
  const name = user.name?.trim() || user.email || "User";

  return (
    <Avatar className="size-8 rounded-lg after:rounded-lg">
      <AvatarImage src={user.avatarUrl || user.image || undefined} alt={name} className="rounded-lg" />
      <AvatarFallback className="rounded-lg">{getInitials(name).slice(0, 2)}</AvatarFallback>
    </Avatar>
  );
}

export function NavUser({ variant = "sidebar" }: { variant?: "sidebar" | "header" } = {}) {
  const { data: session, status } = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHeader = variant === "header";

  if (status === "loading") {
    if (isHeader) return <Skeleton role="status" aria-label="Loading user" className="size-11 rounded-lg" />;
    return (
      <div role="status" aria-label="Loading user" className="flex items-center gap-2 p-2">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <Skeleton className="h-8 flex-1 group-data-[collapsible=icon]:hidden" />
      </div>
    );
  }

  if (!session?.user) return null;

  const user = session.user;
  const name = user.name?.trim() || user.email || "User";
  const role = roleLabels[user.role];

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setError(null);
    try {
      const result = await signOut({ redirect: false, redirectTo: "/login" });
      if (!result?.url) throw new Error("Missing sign-out redirect");
      window.location.assign(result.url);
    } catch {
      setError("Unable to sign out. Please try again.");
      setIsSigningOut(false);
    }
  }

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <>
      <SidebarMenu className={isHeader ? "w-11" : undefined}>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                isHeader ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`User menu for ${name}`}
                    disabled={isSigningOut}
                    aria-busy={isSigningOut}
                  />
                ) : (
                  <SidebarMenuButton
                    size="lg"
                    aria-label={`User menu for ${name}`}
                    disabled={isSigningOut}
                    aria-busy={isSigningOut}
                    className="h-16 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                  />
                )
              }
            >
              {isHeader && isSigningOut ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <UserAvatar user={user} />
              )}
              {!isHeader && (
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-muted-foreground text-xs">{user.email}</span>
                  <span className="truncate text-muted-foreground text-xs">{role}</span>
                </div>
              )}
              {!isHeader &&
                (isSigningOut ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="ml-auto size-4 animate-spin group-data-[collapsible=icon]:hidden motion-reduce:animate-none"
                  />
                ) : (
                  <EllipsisVertical
                    aria-hidden="true"
                    className="ml-auto size-4 group-data-[collapsible=icon]:hidden"
                  />
                ))}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56 rounded-lg"
              side={isHeader || isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                <UserAvatar user={user} />
                <div className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-muted-foreground text-xs">{user.email}</span>
                  <span className="text-muted-foreground text-xs">{role}</span>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={<Link href="/dashboard/settings/profile" prefetch={false} onNavigate={closeMobileSidebar} />}
                >
                  <CircleUser aria-hidden="true" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/dashboard/settings" prefetch={false} onNavigate={closeMobileSidebar} />}
                >
                  <Settings aria-hidden="true" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
                <LogOut aria-hidden="true" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {error && (
        <p
          role="alert"
          className={
            isHeader
              ? "absolute top-full right-3 z-50 max-w-64 rounded-lg border bg-popover p-3 text-destructive text-xs shadow-md"
              : "px-2 text-destructive text-xs"
          }
        >
          {error}
        </p>
      )}
    </>
  );
}
