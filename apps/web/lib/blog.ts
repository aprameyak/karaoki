export type Block = { type: "h2"; text: string } | { type: "p"; text: string } | { type: "ul"; items: string[] };

export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;
  minutes: number;
  body: Block[];
}

export const POSTS: Post[] = [
  {
    slug: "how-ai-vocal-removal-works",
    title: "How AI vocal removal works, and why it is never perfect",
    description:
      "A plain explanation of how source separation models split a song into vocals and instrumental, where they struggle, and how to get cleaner results.",
    date: "2026-10-14",
    minutes: 5,
    body: [
      {
        type: "p",
        text: "A finished song is a single stereo recording. The singer, the drums, the bass and the guitars have already been mixed together, so there is no switch that turns the vocal off. Older vocal removers tried to cancel whatever sat in the exact middle of the stereo image. That works only when the vocal is the one thing panned dead centre, and it also removes the bass and the kick drum, which usually sit there too.",
      },
      { type: "h2", text: "What a separation model does instead" },
      {
        type: "p",
        text: "Modern tools use a neural network trained on thousands of songs where the individual parts were available. The model learns what a voice looks like in the audio, including its harmonics, how it changes over time and how it differs from a snare or a guitar. Given a new song it estimates which parts of the sound belong to the voice and which belong to everything else, then rebuilds two tracks from that estimate.",
      },
      {
        type: "p",
        text: "Karaoki uses Demucs, an open source model for this job. It works on the waveform directly and splits a song into a vocals track and an instrumental track.",
      },
      { type: "h2", text: "Why the result is never perfect" },
      {
        type: "ul",
        items: [
          "The model is making an estimate. When a voice and an instrument occupy the same frequencies at the same time, it has to guess how to divide them.",
          "Reverb and echo on the voice are part of the vocal sound but they spread through the mix, so a faint ghost of the singer can remain.",
          "Backing vocals and harmonies sometimes land in the instrumental, and sometimes parts of a guitar or synth end up in the vocal track.",
          "Heavily compressed or distorted songs are harder than clean, spacious ones.",
        ],
      },
      { type: "h2", text: "How to get cleaner results" },
      {
        type: "ul",
        items: [
          "Start from the best file you have. A lossless WAV or FLAC gives the model more detail than a low bitrate MP3.",
          "Avoid files that were already processed, for example a track that has been through another vocal remover.",
          "Try a different version of the song. A studio recording usually separates better than a live recording.",
          "If a little vocal bleed remains, sing a little louder in the mix. It is rarely noticeable once you are singing over it.",
        ],
      },
      {
        type: "p",
        text: "Remember that removing the vocal does not remove the copyright in the music. Only process songs you have the right to use.",
      },
    ],
  },
  {
    slug: "how-to-pick-the-right-key-for-karaoke",
    title: "How to pick the right key for karaoke",
    description:
      "Why a song can feel impossible in its original key, how semitones work, and a simple way to find the key that suits your voice.",
    date: "2026-10-10",
    minutes: 4,
    body: [
      {
        type: "p",
        text: "If a song feels too high or too low, the song is usually fine and the key is wrong for your voice. Professional singers often change the key of a song to fit their range, and you can do the same.",
      },
      { type: "h2", text: "What a semitone is" },
      {
        type: "p",
        text: "A semitone is the smallest step on a piano, from one key to the very next one, including the black keys. Twelve semitones make an octave. Moving a song up or down by one or two semitones is a small change. Moving it by five or more is a big one.",
      },
      { type: "h2", text: "Find your key in three steps" },
      {
        type: "ul",
        items: [
          "Sing the highest part of the song, usually the chorus. If you strain or crack, lower the key by one or two semitones and try again.",
          "Sing the lowest part. If you cannot reach the notes or your voice goes breathy, raise the key a little.",
          "If the high and the low parts cannot both be comfortable, pick the key where the high part is easy. Low notes can be sung more quietly, but strained high notes cannot be hidden.",
        ],
      },
      { type: "h2", text: "Keep the speed the same" },
      {
        type: "p",
        text: "Simply speeding up or slowing down a recording changes its pitch as well, so the song sounds like a chipmunk or a slow tape. Karaoki changes the key and the tempo independently. You can lower the key by three semitones and the song keeps its original speed, or slow a fast song down while the key stays put.",
      },
      {
        type: "p",
        text: "Use the 30 second preview to test a setting before you export the whole track. When you find a key that works, write it down for that song so you can pick it next time.",
      },
    ],
  },
  {
    slug: "recording-over-a-backing-track",
    title: "Recording yourself over a backing track: a beginner's guide",
    description:
      "Simple, practical tips for recording your voice over an instrumental at home: headphones, levels, sync and how to fix a late or early take.",
    date: "2026-10-05",
    minutes: 5,
    body: [
      {
        type: "p",
        text: "You do not need a studio to record a good karaoke take. A laptop or phone and a pair of headphones are enough. A few habits make a big difference.",
      },
      { type: "h2", text: "Before you press record" },
      {
        type: "ul",
        items: [
          "Wear headphones. If the backing track plays through speakers, the microphone records it again along with your voice and the result sounds muddy and echoey.",
          "Choose a quiet room. Soft furnishings such as curtains, a sofa or a bed make a room sound less boxy.",
          "Stay about a hand's width from the microphone. Closer and you will hear every breath. Further away and the room starts to sound louder than you.",
          "Warm up with a minute of humming or easy scales.",
        ],
      },
      { type: "h2", text: "Levels" },
      {
        type: "p",
        text: "Watch the level meter while you sing. It should move clearly during the loud parts without hitting the top. If it is always near the top, move back or sing more softly. If it barely moves, move closer. You can balance your voice and the backing track after you record.",
      },
      { type: "h2", text: "If your voice sounds late or early" },
      {
        type: "p",
        text: "Every computer and pair of headphones adds a small delay between pressing play and hearing sound, and the recording adds a little more. Bluetooth headphones add the most. If your voice sits slightly behind the beat after mixing, move the sync control towards a negative number so your voice comes earlier, and mix again. Small steps of 20 to 40 milliseconds are usually enough.",
      },
      { type: "h2", text: "Take your time" },
      {
        type: "p",
        text: "Do two or three takes. The first is usually the most nervous, and the second or third is often the best. Karaoki keeps every take private to your account, so you can keep the one you like and delete the rest.",
      },
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((post) => post.slug === slug);
}

export function formatPostDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
