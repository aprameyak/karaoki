import { ToolPage } from "@/components/marketing/tool-page";
import { PITCH_CHANGER } from "@/lib/tools";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Online pitch changer for songs",
  description:
    "Change a song's key in semitones without changing the speed, or change the tempo without changing the key. Preview, then export.",
  path: "/pitch-changer",
});

export default function Page() {
  return <ToolPage content={PITCH_CHANGER} />;
}
