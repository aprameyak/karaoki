"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Star, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJson } from "@/lib/http";
import { cn } from "@/lib/utils";

export function SongActions({
  id,
  title,
  isFavorite,
  canDelete,
  redirectTo,
}: {
  id: string;
  title: string;
  isFavorite: boolean;
  canDelete: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(isFavorite);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PATCH" | "DELETE", body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const out = await postJson(`/api/songs/${id}`, body, method);
    setBusy(false);
    if (!out.ok) {
      setError(out.message);
      return false;
    }
    return true;
  }

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    if (!(await send("PATCH", { isFavorite: next }))) setFavorite(!next);
    else router.refresh();
  }

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    if (await send("PATCH", { title: name })) {
      setRenaming(false);
      router.refresh();
    }
  }

  async function remove() {
    if (await send("DELETE")) {
      setConfirming(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={favorite}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          disabled={busy}
          onClick={() => void toggleFavorite()}
        >
          <Star className={cn("h-5 w-5", favorite && "fill-accent text-accent")} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Rename song" onClick={() => setRenaming((v) => !v)}>
          <Pencil className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete song"
          disabled={!canDelete}
          title={canDelete ? undefined : "Cancel processing before deleting"}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>
      {renaming ? (
        <form onSubmit={saveName} className="flex gap-2">
          <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} aria-label="Song title" required />
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>
            Save
          </Button>
        </form>
      ) : null}
      {confirming ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <p>Delete this song and all of its files? This cannot be undone.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove()}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
