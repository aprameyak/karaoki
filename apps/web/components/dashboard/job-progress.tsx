"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { STAGE_LABELS, isActiveJob, type JobStatus } from "@karaoki/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { postJson, send } from "@/lib/http";

export interface JobView {
  id: string;
  status: JobStatus;
  stage: string | null;
  progress: number | null;
  error: string | null;
}

const POLL_MS = 2000;
const GIVE_UP_AFTER = 30;
const WARN_AFTER = 5;

export function JobProgress({ initial, compact = false }: { initial: JobView; compact?: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<JobView>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const failures = useRef(0);

  useEffect(() => {
    if (!isActiveJob(job.status)) return;
    failures.current = 0;
    let stopped = false;
    const timer = setInterval(async () => {
      const out = await send(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (stopped) return;
      if (!out.ok || !out.res) {
        const status = out.res?.status;
        if (status === 401) {
          clearInterval(timer);
          router.refresh();
          return;
        }
        if (status === 404) {
          clearInterval(timer);
          setMessage("This job no longer exists.");
          return;
        }
        failures.current += 1;
        if (failures.current >= GIVE_UP_AFTER) {
          clearInterval(timer);
          setMessage("Lost connection to the server. Reload the page to check again.");
        } else if (failures.current >= WARN_AFTER) {
          setMessage("Lost connection to the server. Retrying...");
        }
        return;
      }
      failures.current = 0;
      setMessage(null);
      const body = (await out.res.json()) as { job: JobView };
      if (stopped) return;
      setJob(body.job);
      if (!isActiveJob(body.job.status)) {
        clearInterval(timer);
        router.refresh();
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [job.id, job.status, router]);

  const act = useCallback(
    async (action: "cancel" | "retry") => {
      setBusy(true);
      setMessage(null);
      const out = await postJson(`/api/jobs/${job.id}/${action}`);
      setBusy(false);
      if (!out.ok || !out.res) {
        setMessage(out.message);
        return;
      }
      const body = (await out.res.json()) as { job: JobView };
      setJob(body.job);
      router.refresh();
    },
    [job.id, router],
  );

  const stage = job.stage ? (STAGE_LABELS[job.stage] ?? job.stage) : "Waiting in the queue";
  const active = isActiveJob(job.status);

  return (
    <div className="space-y-3">
      {active ? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span aria-live="polite">{job.status === "queued" ? "Waiting in the queue" : stage}</span>
            {job.progress !== null ? <span className="text-muted">{job.progress}%</span> : null}
          </div>
          <Progress value={job.status === "queued" ? null : job.progress} label="Processing progress" />
          {!compact ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void act("cancel")}>
              Cancel
            </Button>
          ) : null}
        </>
      ) : null}
      {job.status === "failed" ? (
        <>
          <Alert>{job.error ?? "Processing failed."}</Alert>
          <Button size="sm" disabled={busy} onClick={() => void act("retry")}>
            Try again
          </Button>
        </>
      ) : null}
      {job.status === "canceled" ? (
        <>
          <Alert tone="info">This job was canceled.</Alert>
          <Button size="sm" disabled={busy} onClick={() => void act("retry")}>
            Process again
          </Button>
        </>
      ) : null}
      {job.status === "completed" ? <Alert tone="success">Your karaoke track is ready.</Alert> : null}
      {message ? <Alert>{message}</Alert> : null}
    </div>
  );
}
