"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { firstError, signupSchema } from "@/lib/auth-utils";
import { createClient } from "@/lib/supabase/client";

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = signupSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.name },
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }
    if (data.session) {
      router.replace(next);
      router.refresh();
      return;
    }
    setSentTo(parsed.data.email);
    setBusy(false);
  }

  if (sentTo) {
    return (
      <Alert tone="success">
        We sent a verification link to <strong>{sentTo}</strong>. Open it to finish creating your account.
      </Alert>
    );
  }

  return (
    <>
      <GoogleButton next={next} />
      <OrDivider />
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          <p className="mt-2 text-xs text-muted">At least 8 characters.</p>
        </div>
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating account..." : "Create account"}
        </Button>
        <p className="text-center text-xs text-muted">
          By continuing you agree to the terms and confirm that you will only upload music you have the right to use.
        </p>
      </form>
    </>
  );
}
