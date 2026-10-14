import { Card } from "@/components/ui/card";
import { DeleteAccount, ExportButton, PreferencesForm, ProfileForm } from "@/components/dashboard/settings-forms";
import { loadAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { formatBytes } from "@/lib/utils";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? "";
  const account = await loadAccount(supabase, userId);
  const { data: prefs } = await supabase.from("user_preferences").select("default_volume").maybeSingle();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted">{account.email}</p>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Profile</h2>
        <ProfileForm userId={userId} displayName={account.displayName === "there" ? "" : account.displayName} />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Player</h2>
        <PreferencesForm userId={userId} defaultVolume={prefs?.default_volume ? Number(prefs.default_volume) : 0.8} />
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Usage limits</h2>
        <p className="text-muted">
          Karaoki is free. Each month you can process {account.plan.monthlyJobs} songs, and you can keep{" "}
          {formatBytes(account.plan.maxStorageBytes)} of music in your library.
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Your data</h2>
        <p className="mb-4 text-sm text-muted">Download a copy of your account data and links to your files.</p>
        <ExportButton />
      </Card>

      <Card className="border-danger/40">
        <h2 className="mb-4 text-lg font-semibold text-danger">Delete account</h2>
        <DeleteAccount />
      </Card>
    </div>
  );
}
