import { cn } from "@/lib/utils";
import type { Verdict, StepKind, Polarity, Lifecycle, Priority } from "@/lib/mock/types";

export function StatusPill({ verdict, className }: { verdict: Verdict; className?: string }) {
  const map: Record<Verdict, { label: string; cls: string }> = {
    passed:   { label: "Passed",   cls: "text-pass bg-pass/10 ring-pass/20" },
    failed:   { label: "Failed",   cls: "text-fail bg-fail/10 ring-fail/25" },
    blocked:  { label: "Blocked",  cls: "text-warn bg-warn/10 ring-warn/25" },
    skipped:  { label: "Skipped",  cls: "text-idle bg-idle/10 ring-idle/20" },
    not_run:  { label: "Not run",  cls: "text-idle bg-idle/10 ring-idle/20" },
    retest:   { label: "Retest",   cls: "text-warn bg-warn/10 ring-warn/25" },
  };
  const m = map[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset tabular-nums",
        m.cls, className
      )}
      aria-label={`Verdict: ${m.label}`}
    >
      <span className="status-dot" style={{ background: "currentColor" }} />
      {m.label}
    </span>
  );
}

export function KindBadge({ kind, className }: { kind: StepKind; className?: string }) {
  const map: Record<StepKind, { color: string; label: string }> = {
    web: { color: "text-kind-web bg-kind-web/10 ring-kind-web/20", label: "WEB" },
    api: { color: "text-kind-api bg-kind-api/10 ring-kind-api/25", label: "API" },
    db:  { color: "text-kind-db bg-kind-db/10 ring-kind-db/25", label: "DB" },
  };
  const m = map[kind];
  return (
    <span className={cn(
      "inline-flex h-5 items-center rounded px-1.5 text-xs font-semibold tracking-wider ring-1 ring-inset font-mono",
      m.color, className
    )}>{m.label}</span>
  );
}

export function PriorityDot({ p }: { p?: Priority }) {
  const color =
    p === "urgent" ? "bg-fail" :
    p === "high"   ? "bg-warn" :
    p === "med"    ? "bg-primary" :
                     "bg-idle";
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} aria-label={`Priority: ${p ?? "none"}`} />;
}

export function PolarityBadge({ polarity }: { polarity: Polarity }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset font-mono uppercase tracking-wider",
      polarity === "positive"
        ? "text-pass bg-pass/10 ring-pass/20"
        : "text-fail bg-fail/10 ring-fail/25"
    )}>{polarity === "positive" ? "POS" : "NEG"}</span>
  );
}

export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  const map: Record<Lifecycle, string> = {
    draft:    "text-idle bg-idle/10 ring-idle/20",
    active:   "text-primary bg-primary/10 ring-primary/20",
    modified: "text-warn bg-warn/10 ring-warn/20",
    retired:  "text-muted-foreground bg-muted ring-border",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset uppercase tracking-wider",
      map[lifecycle]
    )}>{lifecycle}</span>
  );
}

export function TechniqueBadge({ technique }: { technique: string }) {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-border bg-muted/40 text-muted-foreground uppercase tracking-wider font-mono">
      {technique}
    </span>
  );
}
