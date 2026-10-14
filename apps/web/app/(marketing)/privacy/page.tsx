import { DraftNotice, PageHeader, Prose } from "@/components/marketing/page-header";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy policy",
  description: "How Karaoki handles your account data, uploads and recordings.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacy policy" />
      <DraftNotice />
      <Prose>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: your email address, display name and sign-in method.</li>
          <li>The audio files you upload, the tracks we create from them and your recordings.</li>
          <li>Usage records such as how many songs you processed in a month.</li>
          <li>Operational logs such as errors and request timings. Logs do not contain passwords or access tokens.</li>
        </ul>
        <h2>How uploads are protected</h2>
        <p>
          Uploads are stored in private buckets. Only your account can read them, and downloads use short-lived signed
          links. Uploads are never published, shared or added to a public catalog.
        </p>
        <h2>How we use your data</h2>
        <p>We use your data to run the service: sign you in, process your songs, enforce plan limits and prevent abuse.</p>
        <h2>Your controls</h2>
        <ul>
          <li>Export your data from Settings at any time.</li>
          <li>Delete individual songs, or delete your account and all of its files from Settings.</li>
        </ul>
        <h2>Retention</h2>
        <p>
          Unfinished uploads are removed after 24 hours. Audit logs are removed after one year. Deleting your account
          removes your files and records.
        </p>
        <h2>Service providers</h2>
        <p>
          Karaoki uses providers for hosting, database and storage, authentication, payments and email. The list of
          providers should be finalized and added here before launch.
        </p>
      </Prose>
    </>
  );
}
