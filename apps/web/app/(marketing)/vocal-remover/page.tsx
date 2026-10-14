import { ToolPage } from "@/components/marketing/tool-page";
import { VOCAL_REMOVER } from "@/lib/tools";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Online vocal remover",
  description:
    "Remove vocals from a song online with the Demucs AI model. Get a separate instrumental and vocals track as MP3 files, free.",
  path: "/vocal-remover",
});

export default function Page() {
  return <ToolPage content={VOCAL_REMOVER} />;
}
