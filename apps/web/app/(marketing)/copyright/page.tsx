import { CopyrightForm } from "@/components/marketing/copyright-form";
import { DraftNotice, PageHeader, Prose } from "@/components/marketing/page-header";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Copyright and takedowns",
  description: "How Karaoki handles copyright, and how to report content that infringes your rights.",
  path: "/copyright",
});

export default function CopyrightPage() {
  return (
    <>
      <PageHeader title="Copyright and takedowns" />
      <DraftNotice />
      <Prose>
        <h2>Our approach</h2>
        <p>
          Karaoki does not provide, sell or publicly host songs. Every upload is private to the account that uploaded it,
          and users must confirm they have the right to process each file.
        </p>
        <p>
          Removing vocals does not remove copyright. The instrumental you create is still a derivative of the original
          work and carries the same restrictions.
        </p>
        <h2>Reporting infringement</h2>
        <p>
          If you believe content on Karaoki infringes your copyright, describe the work and where it appears using the form
          below. Reports are logged, reviewed and, where appropriate, the content is removed and the account is actioned.
        </p>
      </Prose>
      <div className="mx-auto max-w-3xl px-5 pb-10">
        <CopyrightForm />
      </div>
    </>
  );
}
