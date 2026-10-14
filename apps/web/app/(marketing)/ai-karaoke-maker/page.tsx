import { ToolPage } from "@/components/marketing/tool-page";
import { AI_KARAOKE_MAKER } from "@/lib/tools";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "AI karaoke maker",
  description:
    "Make a karaoke track with AI. Upload a song you own, remove the vocals, add synced lyrics, change the key and record your take, all in one private studio.",
  path: "/ai-karaoke-maker",
});

export default function Page() {
  return <ToolPage content={AI_KARAOKE_MAKER} />;
}
