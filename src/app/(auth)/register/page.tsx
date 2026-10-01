import { RegisterForm } from "@/components/auth/register-form";
import { googleEnabled } from "@/lib/auth/google";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return <RegisterForm google={googleEnabled()} />;
}
