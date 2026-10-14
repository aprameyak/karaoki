"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { postJson, send } from "@/lib/http";
import { createClient } from "@/lib/supabase/client";

export function ProfileForm({ userId, displayName }: { userId: string; displayName: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", userId);
    if (error) {
      setState("error");
      return;
    }
    setState("saved");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <Label htmlFor="display-name">Display name</Label>
        <Input id="display-name" value={name} maxLength={100} required onChange={(e) => setName(e.target.value)} />
      </div>
      {state === "saved" ? <Alert tone="success">Saved.</Alert> : null}
      {state === "error" ? <Alert>Could not save your name.</Alert> : null}
      <Button type="submit" disabled={state === "saving" || !name.trim()}>
        {state === "saving" ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}

export function PreferencesForm({
  userId,
  defaultVolume,
  emailNotifications,
}: {
  userId: string;
  defaultVolume: number;
  emailNotifications: boolean;
}) {
  const [volume, setVolume] = useState(defaultVolume);
  const [notify, setNotify] = useState(emailNotifications);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("user_preferences")
      .update({ default_volume: volume, email_notifications: notify })
      .eq("user_id", userId);
    setState(error ? "error" : "saved");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <Label htmlFor="default-volume">Default player volume ({Math.round(volume * 100)}%)</Label>
        <input
          id="default-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-2 w-full accent-primary"
        />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={notify}
          onChange={(event) => setNotify(event.target.checked)}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <span>
          Email me when a song finishes processing or fails.
          <span className="block text-xs text-muted">We only send these emails. No marketing.</span>
        </span>
      </label>
      {state === "saved" ? <Alert tone="success">Saved.</Alert> : null}
      {state === "error" ? <Alert>Could not save your preferences.</Alert> : null}
      <Button type="submit" variant="secondary" disabled={state === "saving"}>
        Save preferences
      </Button>
    </form>
  );
}

export function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    const out = await send("/api/account/export", { cache: "no-store" });
    if (!out.ok || !out.res) {
      setError(out.message);
      setBusy(false);
      return;
    }
    const blob = await out.res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "karaoki-export.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <Button variant="secondary" disabled={busy} onClick={() => void download()}>
        {busy ? "Preparing..." : "Download my data"}
      </Button>
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (text !== "DELETE") return;
    setBusy(true);
    setError(null);
    const out = await postJson("/api/account", undefined, "DELETE");
    if (!out.ok) {
      setError(out.message);
      setBusy(false);
      return;
    }
    router.replace("/login?error=deleted");
    router.refresh();
  }

  return (
    <form onSubmit={remove} className="space-y-4">
      <p className="text-sm text-muted">
        This permanently deletes your account, songs, recordings and files. Type <strong className="text-ink">DELETE</strong>{" "}
        to confirm.
      </p>
      <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Type DELETE to confirm" autoComplete="off" />
      {error ? <Alert>{error}</Alert> : null}
      <Button type="submit" variant="danger" disabled={busy || text !== "DELETE"}>
        {busy ? "Deleting..." : "Delete my account"}
      </Button>
    </form>
  );
}
