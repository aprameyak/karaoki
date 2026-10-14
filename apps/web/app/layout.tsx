import type { Metadata, Viewport } from "next";
import "./globals.css";
import { siteUrl } from "@/lib/env";
import { TAGLINE } from "@/lib/content";

const description =
  "Karaoki is an AI karaoke studio. Upload a song you have the rights to, remove the vocals, sing along with the instrumental and keep everything in your private library.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Karaoki: AI Karaoke Maker and Vocal Remover", template: "%s | Karaoki" },
  description,
  applicationName: "Karaoki",
  openGraph: {
    type: "website",
    siteName: "Karaoki",
    title: `Karaoki: ${TAGLINE}`,
    description,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: `Karaoki: ${TAGLINE}`, description },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#0B0B14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
