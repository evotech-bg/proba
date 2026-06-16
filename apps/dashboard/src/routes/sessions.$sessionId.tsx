import { TimeAgo } from "@/components/ui-extras/time-ago";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Brain, Radio, KeyRound, Wand2, Compass, AlertTriangle, MousePointerClick, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { useProba } from "@/lib/mock/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KnowledgeKind } from "@/lib/mock/types";

export const Route = createFileRoute("/sessions/$sessionId")({
  head: ({ params }) => ({ meta: [{ title: `Session ${params.sessionId} · Proba` }] }),
  component: SessionDetail,
});

const STATUS_STYLE: Record<string, string> = {
  active: "ring-pass/30 text-pass bg-pass/5",
  complete: "ring-primary/30 text-primary bg-primary/5",
  aborted: "ring-fail/30 text-fail bg-fail/5",
};

const KIND_META: Record<KnowledgeKind, { label: string; icon: typeof Brain; tint: string }> = {
  selector: { label: "selector", icon: MousePointerClick, tint: "text-primary ring-primary/30 bg-primary/5" },
  auth: { label: "auth", icon: KeyRound, tint: "text-warn ring-warn/30 bg-warn/5" },
  healing: { label: "healing", icon: Wand2, tint: "text-pass ring-pass/30 bg-pass/5" },
  exploration: { label: "exploration", icon: Compass, tint: "text-muted-foreground ring-hairline bg-panel" },
  quirk: { label: "quirk", icon: AlertTriangle, tint: "text-fail ring-fail/30 bg-fail/5" },
};

function KindTag({ kind }: { kind: KnowledgeKind }) {
  const m = KIND_META[kind] ?? KIND_META.exploration;
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 h-4 px-1.5 rounded ring-1 text-[10px] font-mono uppercase tracking-wider shrink-0", m.tint)}>
      <Icon className="h-2.5 w-2.5" /> {m.label}
    </span>
  );
}

function confLabel(c?: number) {
  if (c == null) return null;
  return `${Math.round(c * 100)}%`;
}

const METRIC_LABEL: Record<string, string> = {
  designMs: "Design", execMs: "Execution", bugMs: "Investigation", setupMs: "Setup",
  design: "Design", exec: "Execution", bug: "Investigation", setup: "Setup",
};

function SessionDetail() {
  const { sessionId } = Route.useParams();
  const sess = useProba((s) => s.sessions.find((x) => x.id === sessionId));
  const navigate = useNavigate();
  if (!sess) return <div className="p-12 text-center text-sm">Session not found</div>;

  const learned = sess.knowledge ?? [];
  const duration = sess.endedAt ? Math.max(0, Math.round((+new Date(sess.endedAt) - +new Date(sess.startedAt)) / 60000)) : undefined;
  const metricRows = Object.entries(sess.metrics ?? {}).filter(([k]) => k !== "steps");

  return (
    <div className="px-6 py-6 max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate({ to: "/sessions" })} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary shrink-0" />
            <h1 className="text-lg font-semibold tracking-tight truncate">{sess.charter || "Untitled exploratory session"}</h1>
            <span className={cn("text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 shrink-0", STATUS_STYLE[sess.status] ?? "ring-hairline bg-panel")}>{sess.status}</span>
          </div>
          <p className="text-[11px] font-mono text-muted-foreground mt-1 break-all">{sess.id}</p>
        </div>
      </div>

      {/* summary strip — plain numbers, no jargon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Stat label="App" value={sess.appKey} />
        <Stat label="Learned this session" value={String(learned.length)} />
        <Stat label="App knows (total)" value={String(sess.appKnowledgeCount ?? learned.length)} />
        <Stat label="Duration" value={duration != null ? `${duration} min` : "—"} />
        <Stat label="Started" value={<TimeAgo date={sess.startedAt} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        <div className="space-y-4">
          {/* timeline built from when each piece of knowledge was observed */}
          <div className="rounded-lg ring-1 ring-hairline bg-card">
            <div className="px-4 py-2.5 hairline-b">
              <h2 className="text-sm font-medium">Timeline</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">What the agent learned, in the order it observed it.</p>
            </div>
            {sess.timeline.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-muted-foreground">
                Nothing was recorded in this session yet.
              </div>
            ) : (
              <ol className="p-4 space-y-3 relative">
                <div className="absolute left-[22px] top-4 bottom-4 w-px bg-hairline" />
                {sess.timeline.map((ev, i) => (
                  <li key={i} className="flex items-start gap-3 relative">
                    <div className="h-4 w-4 rounded-full bg-card ring-2 ring-primary mt-0.5 z-10 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <KindTag kind={ev.kind} />
                        <span className="text-[12px] font-mono truncate">{ev.action}</span>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">{format(new Date(ev.ts), "HH:mm:ss")}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* SBTM-style time breakdown, only when the session recorded metrics */}
          {metricRows.length > 0 && (
            <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
              <h2 className="text-sm font-medium mb-1">Time breakdown</h2>
              <p className="text-[11px] text-muted-foreground mb-3">Where the session's time went.</p>
              <div className="space-y-2">
                {metricRows.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground">{METRIC_LABEL[k] ?? k}</span>
                    <span className="font-mono">{v >= 1000 ? `${Math.round(v / 1000)}s` : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* free-form notes the agent left, when present */}
          {sess.notes && sess.notes.length > 0 && (
            <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
              <h2 className="text-sm font-medium mb-2">Notes</h2>
              <ul className="text-[12px] text-muted-foreground space-y-1.5 list-disc pl-4">
                {sess.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg ring-1 ring-primary/20 bg-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-sm font-medium">Knowledge learned</h2>
              <span className="text-muted-foreground font-mono text-[11px]">· {learned.length}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Durable facts captured here. <span className="text-foreground">These carry into future sessions</span> for{" "}
              <span className="font-mono">{sess.appKey}</span> so the agent reuses them instantly.
            </p>
            {learned.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Nothing learned in this session.
                {sess.appKnowledgeCount ? ` The app already knows ${sess.appKnowledgeCount} fact${sess.appKnowledgeCount === 1 ? "" : "s"} from earlier sessions.` : ""}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {learned.map((k, i) => (
                  <li key={i} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <KindTag kind={k.kind} />
                      <span className="text-[12px] truncate flex-1">{k.name}</span>
                      {confLabel(k.confidence) && (
                        <span className={cn("text-[10px] font-mono", k.confidence >= 0.8 ? "text-pass" : k.confidence >= 0.5 ? "text-warn" : "text-fail")}>{confLabel(k.confidence)}</span>
                      )}
                    </div>
                    <code className="block bg-panel ring-1 ring-hairline rounded px-2 py-1 text-[11px] font-mono text-muted-foreground overflow-auto">{k.value}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* tickets filed during this session, when any */}
          {sess.linkedTasks && sess.linkedTasks.length > 0 && (
            <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                <h2 className="text-sm font-medium">Tickets from this session</h2>
                <span className="text-muted-foreground font-mono text-[11px]">· {sess.linkedTasks.length}</span>
              </div>
              <ul className="space-y-1.5">
                {sess.linkedTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-[12px]">
                    <span className="text-[10px] font-mono uppercase text-muted-foreground w-16 shrink-0">{t.status}</span>
                    <Link to="/board" className="text-primary hover:underline truncate">{t.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md ring-1 ring-hairline bg-panel/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">{label}</div>
      <div className="text-[13px] font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}
