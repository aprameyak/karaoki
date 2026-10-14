import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Tools",
    links: [
      { href: "/ai-karaoke-maker", label: "AI karaoke maker" },
      { href: "/vocal-remover", label: "Vocal remover" },
      { href: "/mp3-to-karaoke", label: "MP3 to karaoke" },
      { href: "/pitch-changer", label: "Pitch changer" },
    ],
  },
  {
    title: "Company",
    links: [{ href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact" }],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/copyright", label: "Copyright and takedowns" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">Your Music. Your Voice. Your Stage.</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="mb-3 text-sm font-medium">{column.title}</p>
            <ul className="space-y-2 text-sm text-muted">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line/40 py-6 text-center text-xs text-muted">
        <p>Only upload music you have the right to use. Removing vocals does not remove copyright.</p>
        <p className="mt-1">&copy; {new Date().getFullYear()} Karaoki</p>
      </div>
    </footer>
  );
}
