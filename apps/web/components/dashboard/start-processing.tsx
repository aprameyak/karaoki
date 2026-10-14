"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/http";

export function StartProcessing({ songId }: { songId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await postJson(`/api/songs/${songId}/process`);
    if (!out.ok) {
      setError(out.message);
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
