import { BarChart3, BookOpen, CalendarDays, Home, Settings, Target, Timer, UserRound, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/study", label: "Study", icon: BookOpen },
  { href: "/timer", label: "Timer", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/goals", label: "Goals", icon: Target },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings#profile", label: "Profile", icon: UserRound },
];

export const MOBILE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/study", label: "Study", icon: BookOpen },
  { href: "/timer", label: "Timer", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Profile", icon: UserRound },
];
