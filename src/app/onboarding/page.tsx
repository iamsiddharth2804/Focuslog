import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Onboarding } from "@/components/onboarding";

export const metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.onboardedAt) redirect("/dashboard");
  return <Onboarding name={user.name.split(" ")[0]!} />;
}
