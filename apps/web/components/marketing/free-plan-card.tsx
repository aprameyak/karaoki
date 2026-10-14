import Link from "next/link";
import { Check } from "lucide-react";
import { FREE_PLAN } from "@karaoki/shared";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatBytes } from "@/lib/utils";

const items = [
  `${FREE_PLAN.monthlyJobs} songs processed per month`,
  `${formatBytes(FREE_PLAN.maxStorageBytes)} of private storage`,
  `Files up to ${formatBytes(FREE_PLAN.maxFileBytes)} and ${FREE_PLAN.maxDurationSeconds / 60} minutes long`,
  "Karaoke player with instrumental, vocals and original",
  "Download your instrumental and vocals",
  "Export or delete your data any time",
];

export function FreePlanCard() {
  return (
    <Card className="mx-auto max-w-xl border-primary/60">
      <h3 className="text-xl font-semibold">Free for everyone</h3>
      <p className="mt-4">
        <span className="text-5xl font-semibold">$0</span>
        <span className="text-muted"> / always</span>
      </p>
      <ul className="mt-6 space-y-3 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <Link href="/signup" className={cn(buttonVariants(), "mt-8 w-full")}>
        Start free
      </Link>
    </Card>
  );
}
