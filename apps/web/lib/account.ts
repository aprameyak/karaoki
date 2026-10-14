import { FREE_PLAN, type PlanLimits } from "@karaoki/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

export function currentPeriodStart(now: Date = new Date()): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}-01`;
}

export interface AccountSummary {
  displayName: string;
  email: string | null;
  plan: PlanLimits;
  jobsUsed: number;
  storageUsed: number;
  songCount: number;
}

interface PlanRow {
  id: string;
  name: string;
  monthly_jobs: number;
  max_storage_bytes: number;
  max_file_bytes: number;
  max_duration_seconds: number;
}

export function planFromRow(row: PlanRow | null | undefined): PlanLimits {
  if (!row) return FREE_PLAN;
  return {
    id: row.id,
    name: row.name,
    monthlyJobs: row.monthly_jobs,
    maxStorageBytes: Number(row.max_storage_bytes),
    maxFileBytes: Number(row.max_file_bytes),
    maxDurationSeconds: row.max_duration_seconds,
  };
}

export async function loadAccount(supabase: SupabaseClient, userId: string): Promise<AccountSummary> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, plan_id")
    .eq("id", userId)
    .maybeSingle();

  const { data: planRow } = await supabase
    .from("plans")
    .select("*")
    .eq("id", profile?.plan_id ?? "free")
    .maybeSingle();

  const { data: usage } = await supabase
    .from("usage_records")
    .select("jobs_used")
    .eq("user_id", userId)
    .eq("period_start", currentPeriodStart())
    .maybeSingle();

  const { data: files } = await supabase.from("audio_files").select("size_bytes").eq("user_id", userId);
  const { count } = await supabase.from("songs").select("id", { count: "exact", head: true }).eq("user_id", userId);

  const storageUsed = ((files ?? []) as { size_bytes: number }[]).reduce((sum, f) => sum + Number(f.size_bytes), 0);
  return {
    displayName: profile?.display_name ?? "there",
    email: profile?.email ?? null,
    plan: planFromRow(planRow as PlanRow | null),
    jobsUsed: usage?.jobs_used ?? 0,
    storageUsed,
    songCount: count ?? 0,
  };
}
