"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/fetcher";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      {sent ? (
        <p className="mt-3 text-sm text-muted-foreground">
          If an account exists for <span className="text-foreground">{email}</span>, a reset link has been issued. It expires in one hour.
        </p>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            await api("/api/auth/forgot-password", { body: { email } }).catch(() => null);
            setSent(true);
            setLoading(false);
          }}
        >
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={loading || !email}>Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-[13px]">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">Back to sign in</Link>
      </p>
    </div>
  );
}
