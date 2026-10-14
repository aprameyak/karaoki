import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-3 py-1 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-muted",
      info: "bg-primary/15 text-link",
      success: "bg-success/15 text-success",
      danger: "bg-danger/15 text-danger",
      accent: "bg-accent/15 text-accent",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
