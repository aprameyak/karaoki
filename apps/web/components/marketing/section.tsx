import { cn } from "@/lib/utils";

export function Section({
  id,
  title,
  intro,
  className,
  children,
}: {
  id?: string;
  title: string;
  intro?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("mx-auto max-w-6xl px-5 py-16", className)}>
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
      {intro ? <p className="mt-3 max-w-2xl text-muted">{intro}</p> : null}
      <div className="mt-10">{children}</div>
    </section>
  );
}
