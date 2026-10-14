import { Pause, SkipBack, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const BARS = Array.from({ length: 64 }, (_, i) => {
  const value = Math.abs(Math.sin(i * 0.55) * 0.6 + Math.sin(i * 0.17 + 1) * 0.35);
  return Math.max(0.12, Math.min(1, value));
});

export function ProductPreview() {
  return (
    <div className="min-w-0 rounded-3xl border border-line bg-surface p-5 shadow-2xl shadow-primary/10" aria-hidden="true">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-medium">Your song title</p>
          <p className="text-xs text-muted">Separated and ready</p>
        </div>
        <Badge tone="success">Ready</Badge>
      </div>
      <div className="flex h-24 items-center gap-[3px]">
        {BARS.map((value, index) => (
          <div
            key={index}
            className={index < 24 ? "flex-1 rounded-full bg-gradient-to-t from-primary to-accent" : "flex-1 rounded-full bg-line"}
            style={{ height: `${value * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>0:48</span>
        <span>3:12</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SkipBack className="h-5 w-5 text-muted" />
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-primary to-accent">
            <Pause className="h-5 w-5" />
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-primary/20 px-3 py-1 text-link">Instrumental</span>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-muted">Vocals</span>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-muted">Original</span>
        </div>
        <Volume2 className="h-5 w-5 text-muted" />
      </div>
    </div>
  );
}
