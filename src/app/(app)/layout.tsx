import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboardedAt) redirect("/onboarding");
  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        defaultFocusMinutes: user.defaultFocusMinutes,
        defaultBreakMinutes: user.defaultBreakMinutes,
        longBreakMinutes: user.longBreakMinutes,
        longBreakEvery: user.longBreakEvery,
        autoStartBreaks: user.autoStartBreaks,
        autoStartFocus: user.autoStartFocus,
      }}
    >
      {children}
    </AppShell>
  );
}
