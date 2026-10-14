"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function CopyrightForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/copyright", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporterName: form.get("name"),
          reporterEmail: form.get("email"),
          workDescription: form.get("work"),
          locationDescription: form.get("location"),
          statementAccepted: form.get("statement") === "on",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Could not send your report");
      }
      setState("sent");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send your report");
      setState("error");
    }
  }

  if (state === "sent") {
    return <Alert tone="success">Thank you. Your report was received and will be reviewed.</Alert>;
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-label="Copyright report">
      <div>
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required maxLength={200} autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="email">Your email</Label>
        <Input id="email" name="email" type="email" required maxLength={254} autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="work">The copyrighted work</Label>
        <textarea
          id="work"
          name="work"
          required
          minLength={10}
          maxLength={2000}
          rows={3}
          className="w-full rounded-xl border border-line bg-surface p-4 text-ink focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <Label htmlFor="location">Where it appears on Karaoki</Label>
        <textarea
          id="location"
          name="location"
          required
          minLength={10}
          maxLength={2000}
          rows={3}
          className="w-full rounded-xl border border-line bg-surface p-4 text-ink focus:border-primary focus:outline-none"
        />
      </div>
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="statement" required className="mt-1 h-4 w-4 accent-primary" />
        <span>
          I state in good faith that the use described is not authorized by the copyright owner, its agent or the law, and
          that the information in this report is accurate.
        </span>
      </label>
      {state === "error" ? <Alert>{message}</Alert> : null}
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending..." : "Submit report"}
      </Button>
    </form>
  );
}
