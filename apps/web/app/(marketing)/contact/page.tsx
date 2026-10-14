import { PageHeader, Prose } from "@/components/marketing/page-header";
import { SupportForm } from "@/components/marketing/support-form";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact",
  description: "Get in touch with the Karaoki team about support or copyright.",
  path: "/contact",
});

export default function ContactPage() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <>
      <PageHeader title="Contact" intro="Questions, feedback or problems with your account." />
      <Prose>
        <p>Send us a message with the form below and we will reply by email.</p>
        {email ? (
          <p>
            You can also write to <a href={`mailto:${email}`}>{email}</a>.
          </p>
        ) : null}
        <p>
          To report content that infringes your copyright, use the form on the <a href="/copyright">copyright page</a>{" "}
          so your report is logged and reviewed.
        </p>
      </Prose>
      <div className="mx-auto max-w-3xl px-5 pb-10">
        <SupportForm />
      </div>
    </>
  );
}
