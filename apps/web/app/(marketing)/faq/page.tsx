import { FaqList } from "@/components/marketing/faq-list";
import { JsonLd } from "@/components/marketing/json-ld";
import { PageHeader } from "@/components/marketing/page-header";
import { FAQS } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "FAQ",
  description:
    "Answers about Karaoki: how vocal removal works, supported files, privacy, copyright and limits.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }}
      />
      <PageHeader title="Frequently asked questions" />
      <div className="mx-auto max-w-3xl px-5 pb-10">
        <FaqList items={FAQS} />
      </div>
    </>
  );
}
