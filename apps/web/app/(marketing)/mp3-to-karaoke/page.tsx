import { ToolPage } from "@/components/marketing/tool-page";
import { MP3_TO_KARAOKE } from "@/lib/tools";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "MP3 to karaoke converter",
  description:
    "Convert an MP3 you own into a karaoke track. Upload it, remove the vocals and download the instrumental for free.",
  path: "/mp3-to-karaoke",
});

export default function Page() {
  return <ToolPage content={MP3_TO_KARAOKE} />;
}
