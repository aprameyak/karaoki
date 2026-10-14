import { UploadFlow } from "@/components/dashboard/upload-flow";
import { loadAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Upload" };

export default async function UploadPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const account = await loadAccount(supabase, auth.user?.id ?? "");
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Upload a song</h1>
        <p className="mt-1 text-muted">
          Your file is stored privately. Processing runs in the background and you will see its progress here.
        </p>
      </header>
      <UploadFlow
        limits={{
          maxFileBytes: account.plan.maxFileBytes,
          maxMinutes: Math.floor(account.plan.maxDurationSeconds / 60),
          jobsLeft: Math.max(0, account.plan.monthlyJobs - account.jobsUsed),
        }}
      />
    </div>
  );
}
