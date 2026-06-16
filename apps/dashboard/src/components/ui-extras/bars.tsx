import { cn } from "@/lib/utils";

export function CoverageBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-muted overflow-hidden", className)} aria-label={`Coverage ${pct}%`}>
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PassRateBar({ passed, failed, blocked, className }: {
  passed: number; failed: number; blocked: number; className?: string;
}) {
  const total = passed + failed + blocked || 1;
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-muted overflow-hidden flex", className)}>
      <div className="bg-pass" style={{ width: `${(passed / total) * 100}%` }} />
      <div className="bg-fail" style={{ width: `${(failed / total) * 100}%` }} />
      <div className="bg-warn" style={{ width: `${(blocked / total) * 100}%` }} />
    </div>
  );
}
