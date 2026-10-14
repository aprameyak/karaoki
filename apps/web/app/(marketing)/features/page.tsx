import { PageHeader } from "@/components/marketing/page-header";
import { FEATURES } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Features",
  description:
    "See what Karaoki can do today: AI vocal separation, a karaoke player with a real waveform, a private song library and downloads.",
  path: "/features",
});

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        title="Features"
        intro="What Karaoki can do today."
      />
      <div className="mx-auto grid max-w-5xl gap-5 px-5 pb-10 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="rounded-3xl border border-line bg-surface/60 p-6">
            <h2 className="text-xl font-semibold">{feature.title}</h2>
            <p className="mt-2 text-muted">{feature.body}</p>
          </article>
        ))}
      </div>
    </>
  );
}
