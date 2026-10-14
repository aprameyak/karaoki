import { PageHeader } from "@/components/marketing/page-header";
import { FreePlanCard } from "@/components/marketing/free-plan-card";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Pricing",
  description:
    "Karaoki is free: 3 songs a month, private storage and the full karaoke player. No subscription and no payment details.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <>
      <PageHeader
        title="Karaoki is free"
        intro="No subscription and no payment details. Monthly limits keep processing available for everyone."
      />
      <div className="mx-auto max-w-4xl px-5 pb-10">
        <FreePlanCard />
        <p className="mt-8 text-center text-sm text-muted">
          Your processing count resets at the start of each month. A job that fails does not count against it.
        </p>
      </div>
    </>
  );
}
