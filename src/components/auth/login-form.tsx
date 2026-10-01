"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { GoogleButton, OrDivider } from "./google-button";
import { api, ApiClientError } from "@/lib/fetcher";

const OAUTH_ERRORS: Record<string, string> = {
  google_disabled: "Google sign-in isn't configured on this server.",
  google_state: "Google sign-in expired. Please try again.",
  google_email: "Your Google account has no verified email.",
  google_failed: "Google sign-in failed. Please try again.",
};

export function LoginForm({ google }: { google: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(OAUTH_ERRORS[params.get("error") ?? ""] ?? null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ next: string }>("/api/auth/login", { body: { email, password, remember } });
      const next = params.get("next");
      router.replace(r.next === "/dashboard" && next?.startsWith("/") ? next : r.next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't sign in.");
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Sign in to pick up where you left off.</p>
      <div className="mt-8">
        {google && (
          <>
            <GoogleButton />
            <OrDivider />
          </>
        )}
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-[13px] text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          </div>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !email || !password}>
            {loading && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          New to FocusLog?{" "}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
