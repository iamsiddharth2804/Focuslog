"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { GoogleButton, OrDivider } from "./google-button";
import { api, ApiClientError } from "@/lib/fetcher";

export function RegisterForm({ google }: { google: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const mismatch = f.confirmPassword.length > 0 && f.password !== f.confirmPassword;
  const short = f.password.length > 0 && f.password.length < 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch || short) return;
    setLoading(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const r = await api<{ next: string }>("/api/auth/register", { body: { ...f, timezone } });
      router.replace(r.next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't create your account.");
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Your study data stays private to you.</p>
      <div className="mt-8">
        {google && (
          <>
            <GoogleButton label="Sign up with Google" />
            <OrDivider />
          </>
        )}
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Name" htmlFor="name">
            <Input id="name" autoComplete="name" required value={f.name} onChange={set("name")} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={f.email} onChange={set("email")} />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters." error={short ? "Use at least 8 characters." : undefined}>
            <Input id="password" type="password" autoComplete="new-password" required value={f.password} onChange={set("password")} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={mismatch ? "Passwords don't match." : undefined}>
            <Input id="confirm" type="password" autoComplete="new-password" required value={f.confirmPassword} onChange={set("confirmPassword")} />
          </Field>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !f.name || !f.email || !f.password || mismatch || short}>
            {loading && <Loader2 className="animate-spin" />}
            Create account
          </Button>
        </form>
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
