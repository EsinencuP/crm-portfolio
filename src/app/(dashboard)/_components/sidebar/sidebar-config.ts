import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  DollarSign,
  FileInput,
  GitBranch,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  MessageSquare,
  ScrollText,
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
    { title: "Notifications", url: "/dashboard/notifications", icon: Bell },
    { title: "Mail", url: "/dashboard/mail", icon: Mail },
    { title: "Inbox", url: "/dashboard/inbox", icon: MessageSquare },
    { title: "Forms", url: "/dashboard/forms", icon: FileInput },
  ],
  analytics: [{ title: "Reports", url: "/dashboard/analytics", icon: BarChart3 }],
  settings: [
    { title: "Team & Roles", url: "/dashboard/settings/team", icon: UserCog },
    { title: "Pipeline", url: "/dashboard/settings/pipeline", icon: GitBranch },
    { title: "Workspace", url: "/dashboard/settings/workspace", icon: Building2 },
    { title: "Audit Log", url: "/dashboard/settings/audit-log", icon: ScrollText },
    { title: "Email Settings", url: "/dashboard/settings/email", icon: Mail },
    { title: "Messaging", url: "/dashboard/settings/messaging", icon: MessageSquare },
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
