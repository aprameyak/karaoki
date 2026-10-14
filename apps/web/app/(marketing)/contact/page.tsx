import { PageHeader, Prose } from "@/components/marketing/page-header";
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
        {email ? (
          <p>
            Email us at <a href={`mailto:${email}`}>{email}</a> and we will get back to you.
          </p>
        ) : (
          <p>The support address has not been configured for this deployment yet.</p>
        )}
        <p>
          To report content that infringes your copyright, use the form on the <a href="/copyright">copyright page</a>{" "}
          so your report is logged and reviewed.
        </p>
      </Prose>
    </>
  );
}
