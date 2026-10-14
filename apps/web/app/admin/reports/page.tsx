import { StatusSelect } from "@/components/admin/admin-actions";
import { adminGet, requireAdmin, type CopyrightReport } from "@/lib/admin";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Copyright reports" };

export default async function AdminReportsPage() {
  const { token } = await requireAdmin();
  const { reports } = await adminGet<{ reports: CopyrightReport[] }>("/v1/admin/reports", token);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Copyright reports</h1>
      {reports.length === 0 ? <p className="text-muted">No reports.</p> : null}
      <ul className="space-y-4">
        {reports.map((report) => (
          <li key={report.id} className="space-y-3 rounded-2xl border border-line p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">
                {report.reporter_name} <span className="font-normal text-muted">({report.reporter_email})</span>
              </p>
              <StatusSelect kind="reports" id={report.id} current={report.status} options={["open", "reviewing", "actioned", "rejected"]} />
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Work</dt>
                <dd className="whitespace-pre-wrap">{report.work_description}</dd>
              </div>
              <div>
                <dt className="text-muted">Where it appears</dt>
                <dd className="whitespace-pre-wrap">{report.location_description}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">{timeAgo(report.created_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
