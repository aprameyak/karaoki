"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { postJson } from "@/lib/http";

export function SupportForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    const out = await postJson("/api/support", {
      name: form.get("name"),
      email: form.get("email"),
      message: form.get("message"),
    });
    if (!out.ok) {
      setMessage(out.message);
      setState("error");
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return <Alert tone="success">Thanks, your message was sent. We will reply by email.</Alert>;
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-label="Contact form">
      <div>
        <Label htmlFor="support-name">Your name</Label>
        <Input id="support-name" name="name" required maxLength={200} autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="support-email">Your email</Label>
        <Input id="support-email" name="email" type="email" required maxLength={254} autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="support-message">How can we help?</Label>
        <textarea
          id="support-message"
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          className="w-full rounded-xl border border-line bg-surface p-4 text-ink focus:border-primary focus:outline-none"
        />
      </div>
      {state === "error" ? <Alert>{message}</Alert> : null}
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
