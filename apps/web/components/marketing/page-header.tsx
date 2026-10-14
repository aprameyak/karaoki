export function PageHeader({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="mx-auto max-w-3xl px-5 pb-6 pt-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
      {intro ? <p className="mt-4 text-lg text-muted">{intro}</p> : null}
    </header>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-5 pb-10 leading-relaxed text-muted [&_a]:text-primary [&_a:hover]:underline [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
      {children}
    </div>
  );
}

export function DraftNotice() {
  return (
    <div className="mx-auto mb-8 max-w-3xl px-5">
      <p className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-ink">
        This is a draft prepared for legal review. It is not final legal advice and should be reviewed by a qualified lawyer
        before launch.
      </p>
    </div>
  );
}
