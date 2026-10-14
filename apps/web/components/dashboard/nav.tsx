"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, LayoutDashboard, Settings, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/upload", label: "Upload", icon: UploadCloud, exact: false },
  { href: "/dashboard/library", label: "Library", icon: Library, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="space-y-1">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href, exact) ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-4 text-sm transition",
            isActive(pathname, href, exact) ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2/60 hover:text-ink",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-bg/95 backdrop-blur md:hidden"
    >
      {ITEMS.map(({ href, label, icon: Icon, exact }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href, exact) ? "page" : undefined}
          className={cn(
            "flex h-16 flex-col items-center justify-center gap-1 text-xs",
            isActive(pathname, href, exact) ? "text-primary" : "text-muted",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
