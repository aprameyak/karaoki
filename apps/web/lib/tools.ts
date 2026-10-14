import { FREE_PLAN } from "@karaoki/shared";
import type { ToolContent } from "@/components/marketing/tool-page";
import { formatBytes } from "@/lib/utils";

const limits = {
  size: formatBytes(FREE_PLAN.maxFileBytes),
  minutes: FREE_PLAN.maxDurationSeconds / 60,
  songs: FREE_PLAN.monthlyJobs,
};

export const AI_KARAOKE_MAKER: ToolContent = {
  path: "/ai-karaoke-maker",
  title: "AI karaoke maker",
  intro:
    "Make a karaoke version of a song you own. Karaoki separates the vocals with AI, then gives you a player, lyrics and a recording studio so you can sing the whole thing in one place.",
  stepsTitle: "How to make a karaoke track with AI",
  steps: [
    { name: "Upload your song", text: "Choose an MP3, WAV, M4A or FLAC file that you have the right to use and confirm that you do." },
    { name: "Wait for the AI to separate it", text: "A background job splits the song into an instrumental and a vocals track. You can leave the page and come back." },
    { name: "Add lyrics if you like", text: "Paste lyrics or import a timestamped .lrc file and they scroll in time with the song, with a full screen mode for a screen or TV." },
    { name: "Sing and record", text: "Play the instrumental, change the speed or the key, and record your take over it." },
  ],
  points: [
    { title: "One place for everything", text: "Separation, playback, lyrics, key changes and recording share one private library, so you do not juggle tools." },
    { title: "You choose the key", text: "Lower or raise the key in semitones without changing the speed, then preview 30 seconds before exporting." },
    { title: "Private by default", text: "Your uploads and recordings are visible only to your account and are never published." },
    { title: "Honest progress", text: "The progress bar shows what the separation job is really doing, not a timer." },
  ],
  limits: [
    `Each account can process ${limits.songs} songs a month, with files up to ${limits.size} and ${limits.minutes} minutes long.`,
    "Results depend on the song. Busy mixes and heavy reverb can leave faint traces of the original vocal.",
    "Karaoki does not provide songs or lyrics. Bring your own and only use music you have the right to use.",
  ],
  faqs: [
    { question: "Does Karaoki have a song catalog?", answer: "No. You upload your own files. That keeps your library private and means Karaoki never publishes or shares copyrighted songs." },
    { question: "Can I sing along on my phone?", answer: "Yes. The player and the recording studio work in a modern mobile browser. Use headphones when you record." },
    { question: "Is the AI karaoke maker free?", answer: `Yes. Every account can process ${limits.songs} songs a month at no cost.` },
  ],
  related: [
    { href: "/vocal-remover", label: "Online vocal remover" },
    { href: "/mp3-to-karaoke", label: "MP3 to karaoke" },
    { href: "/pitch-changer", label: "Change a song's key" },
  ],
};

export const VOCAL_REMOVER: ToolContent = {
  path: "/vocal-remover",
  title: "Online vocal remover",
  intro:
    "Remove the vocals from a song in your browser. Karaoki uses the Demucs source separation model and gives you the instrumental and the isolated vocals as separate MP3 files.",
  stepsTitle: "How to remove vocals from a song",
  steps: [
    { name: "Upload the song", text: "Pick the best quality file you have. A lossless file gives the model more to work with than a low bitrate MP3." },
    { name: "Let the model split it", text: "The track is converted, separated into two stems and encoded to MP3." },
    { name: "Listen and compare", text: "Switch between the instrumental, the vocals and the original without losing your place, and use the waveform to jump around." },
    { name: "Download the result", text: "Download the instrumental, and the vocals if you want them, from the song page." },
  ],
  points: [
    { title: "Two clean stems", text: "You get an instrumental track and a vocals-only track, not just one with the voice turned down." },
    { title: "Keeps the bass and drums", text: "Unlike old centre-channel tricks, the model is designed to keep the bass and the kick drum in the instrumental." },
    { title: "Check the quality yourself", text: "Compare the stems against the original in the player before you decide to keep or delete them." },
    { title: "Your files stay yours", text: "Stems are stored privately and reachable only through short-lived links." },
  ],
  limits: [
    "No vocal remover is perfect. Reverb, harmonies and loud, busy mixes can leave traces of the vocal or move some instruments into the vocal track.",
    "Removing the vocals from a recording does not remove the copyright in it. Only process music you have the right to use.",
    `Files can be up to ${limits.size} and ${limits.minutes} minutes long.`,
  ],
  faqs: [
    { question: "What file types can I use?", answer: "MP3, WAV, M4A and FLAC. Karaoki checks the audio itself, so renaming a file does not change how it is treated." },
    { question: "Why can I still hear a little of the singer?", answer: "The model estimates which sound belongs to the voice, and echo and harmonies make that estimate harder. A higher quality source file usually helps." },
    { question: "Can I get only the vocals?", answer: "Yes. Every processed song has a vocals track you can play and download." },
  ],
  related: [
    { href: "/ai-karaoke-maker", label: "AI karaoke maker" },
    { href: "/mp3-to-karaoke", label: "MP3 to karaoke" },
    { href: "/blog/how-ai-vocal-removal-works", label: "How AI vocal removal works" },
  ],
};

export const MP3_TO_KARAOKE: ToolContent = {
  path: "/mp3-to-karaoke",
  title: "Convert an MP3 to a karaoke track",
  intro:
    "Turn an MP3 you already own into a karaoke track. Upload it, let Karaoki remove the vocals, and download an instrumental you can sing over anywhere.",
  stepsTitle: "How to turn an MP3 into karaoke",
  steps: [
    { name: "Create a free account", text: "Sign up with your email or Google. There is no payment step." },
    { name: "Upload your MP3", text: "Drag the file in. Karaoki validates it on the server and stores it in private storage." },
    { name: "Download the instrumental", text: "When processing finishes, download the instrumental as an MP3 from the song page." },
    { name: "Optionally change the key", text: "If the song is too high or low for you, export a version in a different key and tempo." },
  ],
  points: [
    { title: "Works with more than MP3", text: "WAV, M4A and FLAC files are accepted too." },
    { title: "Time is shown honestly", text: "Processing depends on the length of the song and the hardware available, and the page shows the real progress." },
    { title: "Download or sing in the app", text: "Use the built-in player and recording studio, or take the MP3 to your own karaoke setup." },
    { title: "Free to use", text: `Process up to ${limits.songs} songs a month for free.` },
  ],
  limits: [
    `Files can be up to ${limits.size} and ${limits.minutes} minutes long.`,
    "A very low bitrate MP3 limits how clean the result can be.",
    "You must confirm that you have the right to process each file you upload.",
  ],
  faqs: [
    { question: "Is the instrumental an MP3?", answer: "Yes. The instrumental and the vocals are encoded as 192 kbps MP3 files." },
    { question: "Can I put synced lyrics on screen?", answer: "Yes. Import a timestamped .lrc file on the song page and use full screen mode." },
    { question: "How long does conversion take?", answer: "A few minutes for a typical song on a CPU, and less on a machine with a GPU. The progress bar shows the real status." },
  ],
  related: [
    { href: "/vocal-remover", label: "Online vocal remover" },
    { href: "/ai-karaoke-maker", label: "AI karaoke maker" },
    { href: "/pitch-changer", label: "Change a song's key" },
  ],
};

export const PITCH_CHANGER: ToolContent = {
  path: "/pitch-changer",
  title: "Change a song's key without changing its speed",
  intro:
    "Move a song up or down in semitones, or speed it up and slow it down, and keep the other one unchanged. Preview a short clip and export the full track when it sounds right.",
  stepsTitle: "How to change the key of a song online",
  steps: [
    { name: "Process the song", text: "Upload a song and let Karaoki separate it. The key and tempo tools work on the instrumental or the vocals." },
    { name: "Choose a key", text: "Use the plus and minus buttons to move up or down by semitones, from 12 below to 12 above." },
    { name: "Set the tempo", text: "Drag the tempo slider between half speed and double speed. The key stays where you put it." },
    { name: "Preview, then export", text: "Render a 30 second preview to check it, then export the full track and download it." },
  ],
  points: [
    { title: "Independent controls", text: "Key and tempo are processed separately with a time-stretching and pitch-shifting engine, not by just changing the playback speed." },
    { title: "Quick previews", text: "A 30 second preview renders much faster than the whole song, so you can try a few settings." },
    { title: "Saved exports", text: "Your exports stay in your library so you can download them again later." },
    { title: "Instrumental or vocals", text: "Adjust whichever track you need, for example a vocal guide in your key." },
  ],
  limits: [
    "Large key changes can introduce small audio artifacts. Shifts of a few semitones sound the most natural.",
    "A song must be processed before you can change its key.",
    "Exports count toward your storage. Delete ones you no longer need.",
  ],
  faqs: [
    { question: "What is a semitone?", answer: "The smallest step on a piano. Twelve semitones make an octave, so +12 is the same notes one octave higher." },
    { question: "Why not just change the playback speed?", answer: "Changing the speed of a recording also changes its pitch. Karaoki changes them independently, so a slower song keeps its key." },
    { question: "How do I pick the right key?", answer: "Our short guide to picking a karaoke key walks through it step by step.", },
  ],
  related: [
    { href: "/blog/how-to-pick-the-right-key-for-karaoke", label: "How to pick the right key" },
    { href: "/ai-karaoke-maker", label: "AI karaoke maker" },
    { href: "/vocal-remover", label: "Online vocal remover" },
  ],
};
