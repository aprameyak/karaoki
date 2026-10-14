import Link from "next/link";
import { Search } from "lucide-react";
import { SongActions } from "@/components/dashboard/song-actions";
import { SongRow } from "@/components/dashboard/song-row";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { loadAccount } from "@/lib/account";
import { PAGE_SIZE, latestJobs, libraryHref, listSongs, parseLibraryQuery } from "@/lib/songs";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBytes } from "@/lib/utils";

export const metadata = { title: "Library" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseLibraryQuery(await searchParams);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const account = await loadAccount(supabase, auth.user?.id ?? "");
  const { songs, total } = await listSongs(supabase, query);
  const jobs = await latestJobs(supabase, songs.filter((s) => s.status === "processing").map((s) => s.id));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const storagePercent = (account.storageUsed / account.plan.maxStorageBytes) * 100;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-muted">{total} {total === 1 ? "song" : "songs"}</p>
        </div>
        <Link href="/dashboard/upload" className={buttonVariants()}>
          Upload a song
        </Link>
      </header>

      <Card className="py-4">
        <div className="flex items-center justify-between text-sm">
          <span>Storage used</span>
          <span className="text-muted">
            {formatBytes(account.storageUsed)} of {formatBytes(account.plan.maxStorageBytes)}
          </span>
        </div>
        <Progress className="mt-3" value={storagePercent} label="Storage used" />
      </Card>

      <form action="/dashboard/library" method="get" className="flex flex-wrap items-center gap-3" role="search">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Search your songs"
            aria-label="Search your songs"
            className="h-12 w-full rounded-xl border border-line bg-surface pl-11 pr-4 focus:border-primary focus:outline-none"
          />
        </div>
        <select
          name="sort"
          defaultValue={query.sort}
          aria-label="Sort songs"
          className="h-12 rounded-xl border border-line bg-surface px-3 text-sm"
        >
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="title">Title A to Z</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="fav" value="1" defaultChecked={query.favorites} className="h-4 w-4 accent-primary" />
          Favorites
        </label>
        <button type="submit" className={cn(buttonVariants({ variant: "secondary" }))}>
          Apply
        </button>
      </form>

      {songs.length === 0 ? (
        <Card className="text-center">
          <p className="font-medium">{query.q || query.favorites ? "No songs match your filters" : "Your library is empty"}</p>
          <p className="mt-1 text-sm text-muted">
            {query.q || query.favorites ? (
              <Link href="/dashboard/library" className="text-primary hover:underline">
                Clear filters
              </Link>
            ) : (
              "Upload your first song to get started."
            )}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {songs.map((song) => (
            <div key={song.id} className="flex flex-col gap-3 md:flex-row md:items-start">
              <div className="min-w-0 flex-1">
                <SongRow song={song} job={jobs.get(song.id)} />
              </div>
              <SongActions
                id={song.id}
                title={song.title}
                isFavorite={song.is_favorite}
                canDelete={song.status !== "processing"}
              />
            </div>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
          {query.page > 1 ? (
            <Link href={libraryHref(query, { page: query.page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Previous
            </Link>
          ) : null}
          <span className="text-muted">
            Page {query.page} of {pages}
          </span>
          {query.page < pages ? (
            <Link href={libraryHref(query, { page: query.page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
