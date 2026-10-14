import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BeforeAfter } from "@/components/marketing/before-after";
import { FaqList } from "@/components/marketing/faq-list";
import { JsonLd } from "@/components/marketing/json-ld";
import { FreePlanCard } from "@/components/marketing/free-plan-card";
import { ProductPreview } from "@/components/marketing/product-preview";
import { Section } from "@/components/marketing/section";
import { UploadTeaser } from "@/components/marketing/upload-teaser";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { FAQS, FEATURES, STEPS } from "@/lib/content";
import { siteUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const url = siteUrl();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", name: "Karaoki", url },
            { "@type": "WebSite", name: "Karaoki", url },
            {
              "@type": "SoftwareApplication",
              name: "Karaoki",
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Web",
              url,
              description:
                "AI karaoke studio that removes vocals from songs you upload and lets you sing along in your browser.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQS.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: { "@type": "Answer", text: faq.answer },
              })),
            },
          ],
        }}
      />

      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 text-center md:pt-24">
        <Badge tone="info" className="rise">AI vocal remover and karaoke studio</Badge>
        <h1 className="rise mx-auto mt-6 max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
          Turn Any Song Into <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Your Stage.</span>
        </h1>
        <p className="rise mx-auto mt-6 max-w-2xl text-lg text-muted">
          Remove vocals with AI, create karaoke tracks, and sing your favorite songs in your own personal studio.
        </p>
        <div className="rise mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Create Karaoke Free
          </Link>
          <Link href="/how-it-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            See How It Works
          </Link>
        </div>
        <div className="mt-14">
          <UploadTeaser />
        </div>
      </section>

      <Section id="how" title="Three steps to your own karaoke track">
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-3xl border border-line bg-surface/60 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-primary to-accent font-semibold">
                {index + 1}
              </span>
              <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Your personal studio" intro="A player built for singing along, with real controls that actually do something.">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <ProductPreview />
          <ul className="min-w-0 space-y-4 text-muted">
            <li>Click the waveform to jump to any part of the song.</li>
            <li>Switch between the instrumental, the isolated vocals and the original mix without losing your place.</li>
            <li>Slow a song down or speed it up while the pitch stays the same.</li>
            <li>Use keyboard shortcuts and big touch targets on your phone.</li>
          </ul>
        </div>
      </Section>

      <Section title="What you get" intro="What works today and what is coming next, listed honestly.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-3xl border border-line bg-surface/60 p-5">
              <Badge tone={feature.status === "available" ? "success" : "neutral"}>
                {feature.status === "available" ? "Available" : "Coming soon"}
              </Badge>
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted">{feature.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Hear the difference" intro="Listen to a demo track with and without its lead line.">
        <BeforeAfter />
      </Section>

      <Section title="Free to use" intro="No subscription and no payment details. Just monthly limits.">
        <FreePlanCard />
        <p className="mt-6 text-center text-sm">
          <Link href="/pricing" className="inline-flex items-center gap-1 text-primary hover:underline">
            See what is included <ArrowRight className="h-4 w-4" />
          </Link>
        </p>
      </Section>

      <Section title="Questions" className="max-w-3xl">
        <FaqList items={FAQS.slice(0, 5)} />
        <p className="mt-6 text-center text-sm">
          <Link href="/faq" className="text-primary hover:underline">
            Read all questions
          </Link>
        </p>
      </Section>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Ready to take the stage?</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Create a free account and turn your first song into a karaoke track in a few minutes.
        </p>
        <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
          Create Karaoke Free
        </Link>
      </section>
    </>
  );
}
