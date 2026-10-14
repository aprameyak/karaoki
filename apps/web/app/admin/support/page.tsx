import { StatusSelect } from "@/components/admin/admin-actions";
import { adminGet, requireAdmin, type SupportRequest } from "@/lib/admin";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Support" };

export default async function AdminSupportPage() {
  const { token } = await requireAdmin();
  const { requests } = await adminGet<{ requests: SupportRequest[] }>("/v1/admin/support", token);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Support requests</h1>
      {requests.length === 0 ? <p className="text-muted">No requests.</p> : null}
      <ul className="space-y-4">
        {requests.map((request) => (
          <li key={request.id} className="space-y-3 rounded-2xl border border-line p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">
                {request.name}{" "}
                <a href={`mailto:${request.email}`} className="font-normal text-link hover:underline">
                  {request.email}
                </a>
              </p>
              <StatusSelect kind="support" id={request.id} current={request.status} options={["open", "answered", "closed"]} />
            </div>
            <p className="whitespace-pre-wrap text-sm">{request.message}</p>
            <p className="text-xs text-muted">{timeAgo(request.created_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
