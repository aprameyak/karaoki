import Link from "next/link";
import { Check } from "lucide-react";
import { PLAN_CATALOG, type PlanLimits } from "@karaoki/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatBytes, formatPrice } from "@/lib/utils";

function features(plan: PlanLimits): string[] {
  const base = [
    `${plan.monthlyJobs} songs processed per month`,
    `${formatBytes(plan.maxStorageBytes)} private storage`,
    `Files up to ${formatBytes(plan.maxFileBytes)} and ${plan.maxDurationSeconds / 60} minutes`,
    "Karaoke player with instrumental, vocals and original",
  ];
  return plan.id === "pro"
    ? [...base, "Priority processing", "Key and tempo tools (coming)", "Recording studio (coming)"]
    : base;
}

export function PricingCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {Object.values(PLAN_CATALOG).map((plan) => {
        const isPro = plan.id === "pro";
        return (
          <Card key={plan.id} className={cn("flex flex-col", isPro && "border-primary/60")}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              {isPro ? <Badge tone="accent">Billing opens soon</Badge> : null}
            </div>
            <p className="mt-4">
              <span className="text-4xl font-semibold">{formatPrice(plan.priceCents)}</span>
              <span className="text-muted"> / month</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {features(plan).map((item) => (
                <li key={item} className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {isPro ? (
              <Button disabled className="mt-8" variant="secondary">
                Not available yet
              </Button>
            ) : (
              <Link href="/signup" className={cn(buttonVariants(), "mt-8")}>
                Start free
              </Link>
            )}
          </Card>
        );
      })}
    </div>
  );
}
