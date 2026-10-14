"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { emailSchema, firstError } from "@/lib/auth-utils";
import { createClient } from "@/lib/supabase/client";

export function ForgotForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = emailSchema.safeParse(form.get("email"));
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setDone(true);
    setBusy(false);
  }

  if (done) {
    return (
      <Alert tone="success">
        If an account exists for that email, a reset link is on its way. It can take a minute to arrive.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Sending..." : "Send reset link"}
      </Button>
    </form>
  );
}
