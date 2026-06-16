import { TimeAgo } from "@/components/ui-extras/time-ago";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Radio, Brain, ChevronRight, Info } from "lucide-react";
import { useProba, useScopeFilter } from "@/lib/mock/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sessions/")({
  head: () => ({
    meta: [
      { title: "Sessions · Proba" },
      { name: "description", content: "Exploratory recording sessions and the selectors the agent learned." },
    ],
  }),
  component: SessionsList,
});

const STATUS_STYLE: Record<string, string> = {
  active: "ring-pass/30 text-pass bg-pass/5",
  complete: "ring-primary/30 text-primary bg-primary/5",
  aborted: "ring-fail/30 text-fail bg-fail/5",
};

function SessionsList() {
  const inScope = useScopeFilter();
  const sessions = useProba((s) => s.sessions).filter((x) => inScope(x.appKey));
  const totalSelectors = sessions.reduce((n, s) => n + s.knownSelectors.length, 0);

  return (
    <div className="px-6 py-6 max-w-[1100px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {sessions.length} recording session{sessions.length === 1 ? "" : "s"} · {totalSelectors} selector{totalSelectors === 1 ? "" : "s"} learned
        </p>
      </div>

      {/* what a session is — the moat, explained in plain words */}
      <div className="rounded-lg ring-1 ring-primary/20 bg-primary/5 p-3.5 flex gap-3">
        <Brain className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="text-foreground font-medium">A session is one recording of an app being driven through MCP</span> — by the agent or by you.
          Proba captures the steps taken and, more importantly, the <span className="text-foreground">durable selectors</span> it learned
          (how to reliably find each element). That knowledge carries into the next session, so the agent doesn't re-discover the same elements every time.
          This is Proba's memory — what makes the next run smarter than the last.
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg ring-1 ring-hairline bg-card p-10 text-center">
          <Radio className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No sessions yet.</p>
          <p className="text-[12px] text-muted-foreground mt-1">Open a session through the MCP server (<code className="font-mono">proba_session_open</code>) and drive an app — it shows up here.</p>
        </div>
      ) : (
        <div className="rounded-lg ring-1 ring-hairline bg-card overflow-hidden">
          <ul className="divide-y divide-hairline">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link to="/sessions/$sessionId" params={{ sessionId: s.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40">
                  <Radio className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium truncate">{s.charter || "Untitled exploratory session"}</span>
                      <span className={cn("text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 shrink-0", STATUS_STYLE[s.status] ?? "ring-hairline bg-panel")}>{s.status}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono text-muted-foreground">
                      <span className="px-1.5 rounded bg-muted/60">{s.appKey}</span>
                      <span>·</span>
                      <span>{<TimeAgo date={s.startedAt} />}</span>
                    </div>
                  </div>
                  <div className="text-right text-[11px] font-mono text-muted-foreground shrink-0">
                    <div><span className="text-foreground">{s.knownSelectors.length}</span> selector{s.knownSelectors.length === 1 ? "" : "s"} learned</div>
                    <div>{s.stepCount} step{s.stepCount === 1 ? "" : "s"} recorded</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3 w-3" /> A session with 0 steps but learned selectors still carries value — its knowledge feeds future runs.
      </p>
    </div>
  );
}
