import Link from "next/link";
import { PageHeader } from "@/components/marketing/page-header";
import { buttonVariants } from "@/components/ui/button";
import { STEPS } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "How it works",
  description:
    "Upload a song, let the AI separate the vocals from the instrumental, then sing along in your own private karaoke studio.",
  path: "/how-it-works",
});

const details = [
  "Your file is checked on the server by inspecting the audio itself, not just the file name, and is stored under a random identifier in private storage.",
  "A background worker converts the audio, runs the Demucs separation model and encodes two tracks. Long jobs never run inside a web request.",
  "The player streams your tracks through short-lived signed links. You can download your instrumental whenever you like.",
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader title="How it works" intro="From upload to singing along in three steps." />
      <ol className="mx-auto max-w-3xl space-y-6 px-5 pb-10">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-3xl border border-line bg-surface/60 p-6">
            <p className="text-sm text-link">Step {index + 1}</p>
            <h2 className="mt-1 text-2xl font-semibold">{step.title}</h2>
            <p className="mt-2 text-muted">{step.body}</p>
            <p className="mt-3 text-sm text-muted">{details[index]}</p>
          </li>
        ))}
      </ol>
      <p className="pb-6 text-center">
        <Link href="/signup" className={buttonVariants({ size: "lg" })}>
          Create Karaoke Free
        </Link>
      </p>
    </>
  );
}
