"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/fetcher";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const token = params.get("token") ?? "";
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/auth/reset-password", { body: { token, password } });
            router.replace("/dashboard");
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiClientError ? err.message : "Couldn't reset password.");
          }
        }}
      >
        <Field label="New password" htmlFor="pw" hint="At least 8 characters.">
          <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={password.length < 8 || !token}>Save password</Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
