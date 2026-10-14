import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 40 40" className={cn("h-9 w-9", className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id})`} />
      <rect x="16.5" y="8" width="7" height="14" rx="3.5" fill="#fff" />
      <path d="M12.5 19a7.5 7.5 0 0 0 15 0" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20 26.5V31M16.5 31h7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="5.5" y="15" width="2.2" height="8" rx="1.1" fill="#fff" fillOpacity="0.75" />
      <rect x="9" y="12.5" width="2.2" height="13" rx="1.1" fill="#fff" fillOpacity="0.55" />
      <rect x="32.8" y="15" width="2.2" height="8" rx="1.1" fill="#fff" fillOpacity="0.75" />
      <rect x="28.8" y="12.5" width="2.2" height="13" rx="1.1" fill="#fff" fillOpacity="0.55" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="Karaoki home">
      <LogoMark />
      <span className="text-xl font-semibold tracking-tight">Karaoki</span>
    </Link>
  );
}
