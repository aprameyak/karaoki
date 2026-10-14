"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/messages";

export function StartProcessing({ songId }: { songId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/songs/${songId}/process`, { method: "POST" });
    if (!res.ok) {
      setError((await readApiError(res)).message);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Button disabled={busy} onClick={() => void start()}>
        {busy ? "Starting..." : "Process this song"}
      </Button>
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
