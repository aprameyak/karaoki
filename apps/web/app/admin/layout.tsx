import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Karaoki admin" },
  robots: { index: false, follow: false },
};

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/reports", label: "Copyright reports" },
  { href: "/admin/support", label: "Support" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <Logo href="/dashboard" />
        <nav aria-label="Admin" className="flex flex-wrap gap-5 text-sm text-muted">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink">
              {link.label}
            </Link>
          ))}
          <Link href="/dashboard" className="hover:text-ink">
            Back to app
          </Link>
        </nav>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
