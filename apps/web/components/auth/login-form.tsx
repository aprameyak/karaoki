"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { firstError, loginSchema } from "@/lib/auth-utils";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes("not confirmed")
          ? "Confirm your email first. Check your inbox for the verification link."
          : "That email and password do not match.",
      );
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      {notice ? <Alert tone="info" className="mb-4">{notice}</Alert> : null}
      <GoogleButton next={next} />
      <OrDivider />
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="mb-2 text-sm text-link hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Logging in..." : "Log in"}
        </Button>
      </form>
    </>
  );
}
