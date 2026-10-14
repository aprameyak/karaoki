export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-32 animate-pulse rounded-3xl bg-surface-2" />
      <div className="h-32 animate-pulse rounded-3xl bg-surface-2" />
    </div>
  );
}
