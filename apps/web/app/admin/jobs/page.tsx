import Link from "next/link";
import { RetryJobButton } from "@/components/admin/admin-actions";
import { adminGet, requireAdmin, type AdminJob } from "@/lib/admin";
import { cn, timeAgo } from "@/lib/utils";

export const metadata = { title: "Jobs" };

const FILTERS = ["all", "failed", "processing", "queued", "completed", "canceled"] as const;

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { token } = await requireAdmin();
  const { status } = await searchParams;
  const filter = FILTERS.find((item) => item === status) ?? "failed";
  const query = filter === "all" ? "" : `?status=${filter}`;
  const { jobs } = await adminGet<{ jobs: AdminJob[] }>(`/v1/admin/jobs${query}`, token);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Jobs</h1>
      <nav aria-label="Filter jobs" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item}
            href={`/admin/jobs?status=${item}`}
            aria-current={item === filter ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm capitalize",
              item === filter ? "bg-gradient-to-r from-primary to-accent text-white" : "bg-surface-2 text-muted hover:text-ink",
            )}
          >
            {item}
          </Link>
        ))}
      </nav>
      {jobs.length === 0 ? (
        <p className="text-muted">No {filter === "all" ? "" : filter} jobs.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Processing jobs</caption>
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Song</th>
                <th scope="col" className="px-4 py-3">Owner</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">When</th>
                <th scope="col" className="px-4 py-3">Details</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((job) => (
                <tr key={job.id} className="align-top">
                  <td className="px-4 py-3">{job.title}</td>
                  <td className="px-4 py-3 text-muted">{job.email}</td>
                  <td className="px-4 py-3 capitalize">{job.status}</td>
                  <td className="px-4 py-3 text-muted">{timeAgo(job.created_at)}</td>
                  <td className="max-w-xs px-4 py-3 text-muted">
                    {job.error ?? (job.stage ? `${job.stage} ${job.progress ?? ""}`.trim() : "")} (attempt {job.attempt})
                  </td>
                  <td className="px-4 py-3">
                    {job.status === "failed" || job.status === "canceled" ? <RetryJobButton jobId={job.id} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
