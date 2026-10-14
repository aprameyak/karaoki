import { ChevronDown } from "lucide-react";
import type { Faq } from "@/lib/content";

export function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="divide-y divide-line rounded-3xl border border-line bg-surface/60">
      {items.map((item) => (
        <details key={item.question} className="group p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
            {item.question}
            <ChevronDown className="h-5 w-5 shrink-0 text-muted transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
