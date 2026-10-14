import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { StudioRecorder } from "@/components/player/studio-recorder";
import { Alert } from "@/components/ui/alert";
import { getSongMedia, listRecordings } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Recording studio" };

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: song } = await supabase.from("songs").select("id, title, status").eq("id", id).maybeSingle();
  if (!song) notFound();

  const back = (
    <Link href={`/dashboard/songs/${id}`} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Back to the song
    </Link>
  );

  if (song.status !== "ready") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {back}
        <Alert tone="info">Process this song first. Once it is ready you can record over its instrumental here.</Alert>
      </div>
    );
  }

  const title = song.title as string;
  const media = await getSongMedia(supabase, id, title);
  const recordings = await listRecordings(supabase, id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {back}
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Record: {title}</h1>
        <p className="mt-1 text-muted">Sing over the instrumental, then save and mix your take.</p>
      </header>
      {media.instrumental ? (
        <StudioRecorder songId={id} title={title} instrumentalUrl={media.instrumental} initialRecordings={recordings} />
      ) : (
        <Alert>The instrumental for this song is not available.</Alert>
      )}
    </div>
  );
}
