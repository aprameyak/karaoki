import { PageHeader } from "@/components/marketing/page-header";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Pricing",
  description:
    "Start with the free Karaoki plan: 3 songs a month, private storage and the full karaoke player. Pro billing opens later.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <>
      <PageHeader
        title="Pricing"
        intro="Start free. These prices and limits are our starting assumptions and may change before paid plans open."
      />
      <div className="mx-auto max-w-4xl px-5 pb-10">
        <PricingCards />
        <p className="mt-8 text-center text-sm text-muted">
          Processing quotas reset at the start of each month. A job that fails does not count against your quota.
        </p>
      </div>
    </>
  );
}
