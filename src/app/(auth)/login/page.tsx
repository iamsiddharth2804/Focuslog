import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { googleEnabled } from "@/lib/auth/google";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm google={googleEnabled()} />
    </Suspense>
  );
}
