import { PLAN_CATALOG, ALLOWED_EXTENSIONS } from "@karaoki/shared";
import { formatBytes, formatPrice } from "@/lib/utils";

const free = PLAN_CATALOG.free;
const pro = PLAN_CATALOG.pro;

export const TAGLINE = "Your Music. Your Voice. Your Stage.";

export interface Faq {
  question: string;
  answer: string;
}

export const FAQS: Faq[] = [
  {
    question: "What is Karaoki?",
    answer:
      "Karaoki is a private karaoke studio. You upload a song you have the right to use, an AI model separates the vocals from the instrumental, and you sing along with the instrumental in your browser.",
  },
  {
    question: "How does the vocal removal work?",
    answer:
      "Karaoki runs a source separation model (Demucs) on your file and produces two tracks: an instrumental and a vocals-only track. The results are often very good but never perfect. Some songs keep faint traces of the original vocals, especially with heavy reverb or backing vocals.",
  },
  {
    question: "Which file types can I upload?",
    answer: `${ALLOWED_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")}. Karaoki inspects the audio itself rather than trusting the file extension. The free plan accepts files up to ${formatBytes(free.maxFileBytes)} and ${free.maxDurationSeconds / 60} minutes long.`,
  },
  {
    question: "Do I need permission to use a song?",
    answer:
      "Yes. You must confirm that you have the right to process every file you upload. Removing the vocals from a recording does not remove the copyright in the music, and Karaoki does not provide or sell songs.",
  },
  {
    question: "Are my uploads private?",
    answer:
      "Yes. Files are stored in private storage that only your account can read, and downloads use short-lived signed links. Nothing you upload is published or shared.",
  },
  {
    question: "How long does processing take?",
    answer:
      "It depends on the length of the song and the hardware that is available. Karaoki shows the real progress reported by the separation job instead of a made-up timer.",
  },
  {
    question: "What does it cost?",
    answer: `The free plan includes ${free.monthlyJobs} songs per month. Pro is planned at ${formatPrice(pro.priceCents)} per month with ${pro.monthlyJobs} songs per month and more storage. Paid billing is not open yet, so every account is on the free plan for now.`,
  },
  {
    question: "Can I change the key or the tempo?",
    answer:
      "The player can slow down or speed up a song today while keeping the pitch. Changing the key and exporting adjusted instrumentals is part of the upcoming Pro tools.",
  },
];

export const STEPS = [
  {
    title: "Upload a song",
    body: "Drop in an MP3, WAV, M4A or FLAC file you have the right to use. It goes straight into your private storage.",
  },
  {
    title: "Let the AI separate it",
    body: "A background worker splits the track into vocals and instrumental. You see real progress while it runs.",
  },
  {
    title: "Sing along",
    body: "Play the instrumental, switch to the vocals or the original, slow it down, and download your instrumental.",
  },
];

export const FEATURES = [
  {
    title: "AI vocal separation",
    body: "Demucs splits every song into an instrumental and a vocals track.",
    status: "available",
  },
  {
    title: "Karaoke player",
    body: "Seek on a real waveform, change the speed, switch between instrumental, vocals and original, and use keyboard shortcuts.",
    status: "available",
  },
  {
    title: "Private library",
    body: "Search, sort, favorite, rename and delete your songs. Everything stays on your account.",
    status: "available",
  },
  {
    title: "Downloads",
    body: "Download your instrumental and, where you are allowed to, the vocals track.",
    status: "available",
  },
  {
    title: "Key and tempo export",
    body: "Change the key in semitones and export the adjusted instrumental.",
    status: "soon",
  },
  {
    title: "Synced lyrics",
    body: "Import timestamped LRC lyrics and follow along line by line.",
    status: "soon",
  },
  {
    title: "Recording studio",
    body: "Record your performance over the instrumental and mix it.",
    status: "soon",
  },
  {
    title: "Pro billing",
    body: "Higher limits and priority processing with Stripe billing.",
    status: "soon",
  },
] as const;
