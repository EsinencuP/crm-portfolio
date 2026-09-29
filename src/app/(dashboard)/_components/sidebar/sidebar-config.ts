import {
  BarChart3,
  Building2,
  CalendarDays,
  DollarSign,
  GitBranch,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  UserCog,
  Users,
} from "lucide-react";

export interface SidebarNavItem {
  readonly title: string;
  readonly url: string;
  readonly icon: LucideIcon;
}

export const sidebarNav = {
  main: [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Contacts", url: "/dashboard/contacts", icon: Users },
    { title: "Companies", url: "/dashboard/companies", icon: Building2 },
    { title: "Deals", url: "/dashboard/deals", icon: DollarSign },
    { title: "Activities", url: "/dashboard/activities", icon: CalendarDays },
  ],
  analytics: [{ title: "Reports", url: "/dashboard/analytics", icon: BarChart3 }],
  settings: [
    { title: "General", url: "/dashboard/settings", icon: Settings },
    { title: "Team & Roles", url: "/dashboard/settings/team", icon: UserCog },
    { title: "Pipeline", url: "/dashboard/settings/pipeline", icon: GitBranch },
  ],
} as const satisfies Record<string, readonly SidebarNavItem[]>;

export const sidebarGroups = [
  { id: "main", label: "MAIN", items: sidebarNav.main },
  { id: "analytics", label: "ANALYTICS", items: sidebarNav.analytics },
  { id: "settings", label: "SETTINGS", items: sidebarNav.settings },
] as const;

export interface SidebarNavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly SidebarNavItem[];
}
