import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Alert({
  tone = "danger",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "danger" | "success" | "info" }) {
  const tones = {
    danger: "border-danger/40 bg-danger/10 text-danger",
    success: "border-success/40 bg-success/10 text-success",
    info: "border-primary/40 bg-primary/10 text-ink",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}
      {...props}
    />
  );
}
