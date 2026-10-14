import Link from "next/link";
import { UploadCloud } from "lucide-react";
import { SongRow } from "@/components/dashboard/song-row";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { loadAccount } from "@/lib/account";
import { SONG_COLUMNS, latestJobs, type SongListItem } from "@/lib/songs";
import { createClient } from "@/lib/supabase/server";
import { formatBytes } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? "";
  const account = await loadAccount(supabase, userId);

  const { data } = await supabase
    .from("songs")
    .select(SONG_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(5);
  const songs = (data ?? []) as SongListItem[];
  const jobs = await latestJobs(supabase, songs.filter((s) => s.status === "processing").map((s) => s.id));

  const jobsLeft = Math.max(0, account.plan.monthlyJobs - account.jobsUsed);
  const jobPercent = account.plan.monthlyJobs > 0 ? (account.jobsUsed / account.plan.monthlyJobs) * 100 : 100;
  const storagePercent = account.plan.maxStorageBytes > 0 ? (account.storageUsed / account.plan.maxStorageBytes) * 100 : 100;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome, {account.displayName}</h1>
          <p className="mt-1 text-muted">Ready to sing? Upload a song to make your next karaoke track.</p>
        </div>
        <Link href="/dashboard/upload" className={buttonVariants({ size: "lg" })}>
          <UploadCloud className="h-5 w-5" /> Upload a song
        </Link>
      </header>

      <section aria-label="Usage" className="grid gap-5 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Processing this month</p>
          <p className="mt-2 text-2xl font-semibold">
            {account.jobsUsed} <span className="text-base font-normal text-muted">of {account.plan.monthlyJobs}</span>
          </p>
          <Progress className="mt-4" value={jobPercent} label="Processing jobs used this month" />
          <p className="mt-2 text-xs text-muted">{jobsLeft} remaining</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Storage</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatBytes(account.storageUsed)}{" "}
            <span className="text-base font-normal text-muted">of {formatBytes(account.plan.maxStorageBytes)}</span>
          </p>
          <Progress className="mt-4" value={storagePercent} label="Storage used" />
          <p className="mt-2 text-xs text-muted">{account.songCount} songs in your library</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Account</p>
          <p className="mt-2 text-2xl font-semibold">Free</p>
          <p className="mt-4 text-sm text-muted">
            Karaoki is free to use. Your limits reset at the start of each month.
          </p>
        </Card>
      </section>

      <section aria-label="Recent songs">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent songs</h2>
          <Link href="/dashboard/library" className="text-sm text-link hover:underline">
            View library
          </Link>
        </div>
        {songs.length === 0 ? (
          <Card className="text-center">
            <p className="font-medium">Your library is empty</p>
            <p className="mt-1 text-sm text-muted">Upload your first song to get started.</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {songs.map((song) => (
              <SongRow key={song.id} song={song} job={jobs.get(song.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
