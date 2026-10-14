import { DraftNotice, PageHeader, Prose } from "@/components/marketing/page-header";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms of service",
  description: "The rules for using Karaoki, including what you may upload.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <>
      <PageHeader title="Terms of service" />
      <DraftNotice />
      <Prose>
        <h2>Using Karaoki</h2>
        <p>
          Karaoki is a tool for processing audio that you have the right to use. You are responsible for the files you
          upload and for how you use the results.
        </p>
        <h2>Rights in your uploads</h2>
        <p>
          Before processing each file you must confirm that you own it or have permission to use it. Removing vocals
          from a recording does <strong>not</strong> remove the copyright in the music or the recording.
        </p>
        <h2>What is not allowed</h2>
        <ul>
          <li>Uploading content you do not have the right to process.</li>
          <li>Sharing, publishing or selling processed copyrighted songs.</li>
          <li>Trying to bypass plan limits, rate limits or security controls.</li>
          <li>Uploading files that contain malware or are designed to harm the service.</li>
        </ul>
        <h2>Plans and limits</h2>
        <p>Plans have monthly processing, storage and file-size limits. Limits may change with notice.</p>
        <h2>Removal and suspension</h2>
        <p>We may remove content and suspend accounts that violate these terms or that are the subject of a valid copyright notice.</p>
        <h2>No warranty</h2>
        <p>Separation quality varies by song. The service is provided as is, without a guarantee of any particular result.</p>
      </Prose>
    </>
  );
}
