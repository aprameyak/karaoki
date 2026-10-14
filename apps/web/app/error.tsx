"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="text-muted">An unexpected error happened. Try again, and if it keeps happening, come back in a few minutes.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
