import { notFound, redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin(): Promise<{ token: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=%2Fadmin");
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", data.user.id).maybeSingle();
  if (!profile?.is_admin) notFound();
  const { data: session } = await supabase.auth.getSession();
  return { token: session.session?.access_token ?? "" };
}

export async function adminGet<T>(path: string, token: string): Promise<T> {
  return apiJson<T>(path, { token });
}

export interface Overview {
  stats: {
    users: number;
    songs: number;
    jobs_by_status: Record<string, number>;
    avg_processing_seconds: number | null;
    total_processing_seconds: number;
    storage_bytes: number;
    open_copyright_reports: number;
    open_support_requests: number;
  };
  estimates: {
    compute_hours: number;
    compute_cost: number;
    storage_gb: number;
    storage_cost_per_month: number;
    based_on_configured_rates: boolean;
  };
}

export interface AdminJob {
  id: string;
  status: string;
  stage: string | null;
  progress: number | null;
  error: string | null;
  attempt: number;
  created_at: string;
  finished_at: string | null;
  title: string;
  email: string;
}

export interface CopyrightReport {
  id: string;
  reporter_name: string;
  reporter_email: string;
  work_description: string;
  location_description: string;
  status: string;
  created_at: string;
}

export interface SupportRequest {
  id: string;
  name: string;
  email: string;
  message: string;
  status: string;
  created_at: string;
}
