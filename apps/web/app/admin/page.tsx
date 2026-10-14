import { Card } from "@/components/ui/card";
import { adminGet, requireAdmin, type Overview } from "@/lib/admin";
import { formatBytes, formatDuration } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const { token } = await requireAdmin();
  const { stats, estimates } = await adminGet<Overview>("/v1/admin/overview", token);
  const statuses = ["queued", "processing", "completed", "failed", "canceled"];

  const cards = [
    { label: "Users", value: stats.users },
    { label: "Songs", value: stats.songs },
    { label: "Average processing time", value: stats.avg_processing_seconds === null ? "No data yet" : formatDuration(stats.avg_processing_seconds) },
    { label: "Storage used", value: formatBytes(stats.storage_bytes) },
    { label: "Open copyright reports", value: stats.open_copyright_reports },
    { label: "Open support requests", value: stats.open_support_requests },
  ];

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>

      <section aria-label="Totals" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm text-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold">{card.value}</p>
          </Card>
        ))}
      </section>

      <section aria-label="Processing jobs">
        <h2 className="mb-4 text-xl font-semibold">Processing jobs</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {statuses.map((status) => (
            <Card key={status} className="p-4">
              <p className="text-sm capitalize text-muted">{status}</p>
              <p className="mt-1 text-2xl font-semibold">{stats.jobs_by_status[status] ?? 0}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-label="Cost estimates">
        <h2 className="mb-2 text-xl font-semibold">Cost estimates</h2>
        <p className="mb-4 text-sm text-muted">
          {estimates.based_on_configured_rates
            ? "Estimates use the hourly compute rate and monthly storage rate set in the API configuration. They are not a bill."
            : "No cost rates are configured, so the dollar amounts below are zero. Set ADMIN_COST_PER_COMPUTE_HOUR and ADMIN_COST_PER_GB_MONTH on the API to see estimates."}
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Card>
            <p className="text-sm text-muted">Compute used</p>
            <p className="mt-2 text-2xl font-semibold">{estimates.compute_hours} hours</p>
            <p className="mt-1 text-sm text-muted">Estimated cost: ${estimates.compute_cost.toFixed(2)}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Storage</p>
            <p className="mt-2 text-2xl font-semibold">{estimates.storage_gb} GB</p>
            <p className="mt-1 text-sm text-muted">Estimated cost per month: ${estimates.storage_cost_per_month.toFixed(2)}</p>
          </Card>
        </div>
      </section>
    </div>
  );
}
