"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/messages";

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/jobs/${jobId}/retry`, { method: "POST" });
    if (!res.ok) {
      setError((await readApiError(res)).message);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void retry()}>
        {busy ? "Retrying..." : "Retry"}
      </Button>
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}

export function StatusSelect({
  kind,
  id,
  current,
  options,
}: {
  kind: "reports" | "support";
  id: string;
  current: string;
  options: string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    const res = await fetch(`/api/admin/${kind}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      setValue(previous);
      setError((await readApiError(res)).message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <select
        value={value}
        aria-label="Status"
        onChange={(event) => void change(event.target.value)}
        className="h-10 rounded-xl border border-line bg-surface px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
