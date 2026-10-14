import Link from "next/link";
import { FaqList } from "@/components/marketing/faq-list";
import { JsonLd } from "@/components/marketing/json-ld";
import { PageHeader } from "@/components/marketing/page-header";
import { buttonVariants } from "@/components/ui/button";
import { siteUrl } from "@/lib/env";
import type { Faq } from "@/lib/content";

export interface ToolContent {
  path: string;
  title: string;
  intro: string;
  stepsTitle: string;
  steps: { name: string; text: string }[];
  points: { title: string; text: string }[];
  limits: string[];
  faqs: Faq[];
  related: { href: string; label: string }[];
}

export function ToolPage({ content }: { content: ToolContent }) {
  const url = `${siteUrl()}${content.path}`;
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "HowTo",
              name: content.stepsTitle,
              url,
              step: content.steps.map((step, index) => ({
                "@type": "HowToStep",
                position: index + 1,
                name: step.name,
                text: step.text,
              })),
            },
            {
              "@type": "FAQPage",
              mainEntity: content.faqs.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: { "@type": "Answer", text: faq.answer },
              })),
            },
          ],
        }}
      />
      <PageHeader title={content.title} intro={content.intro} />
      <div className="mx-auto max-w-3xl space-y-14 px-5 pb-10">
        <div className="text-center">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Try it free
          </Link>
        </div>

        <section aria-labelledby="steps">
          <h2 id="steps" className="text-2xl font-semibold">{content.stepsTitle}</h2>
          <ol className="mt-6 space-y-4">
            {content.steps.map((step, index) => (
              <li key={step.name} className="rounded-2xl border border-line bg-surface/60 p-5">
                <p className="text-sm text-primary">Step {index + 1}</p>
                <h3 className="mt-1 font-semibold">{step.name}</h3>
                <p className="mt-2 text-sm text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="points">
          <h2 id="points" className="text-2xl font-semibold">What you get</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {content.points.map((point) => (
              <article key={point.title} className="rounded-2xl border border-line bg-surface/60 p-5">
                <h3 className="font-semibold">{point.title}</h3>
                <p className="mt-2 text-sm text-muted">{point.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="limits">
          <h2 id="limits" className="text-2xl font-semibold">Good to know</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
            {content.limits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="questions">
          <h2 id="questions" className="mb-6 text-2xl font-semibold">Questions</h2>
          <FaqList items={content.faqs} />
        </section>

        <nav aria-label="Related pages" className="flex flex-wrap justify-center gap-4 text-sm">
          {content.related.map((link) => (
            <Link key={link.href} href={link.href} className="text-primary hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
