import { TimeAgo } from "@/components/ui-extras/time-ago";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useProba, useScopeFilter } from "@/lib/mock/store";
import { PassRateBar } from "@/components/ui-extras/bars";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Film } from "lucide-react";

export const Route = createFileRoute("/runs/")({
  head: () => ({
    meta: [
      { title: "Runs · Proba" },
      { name: "description", content: "Run timeline, verdict breakdowns, and flaky-test management." },
    ],
  }),
  component: RunsPage,
});

function RunsPage() {
  const inScope = useScopeFilter();
  const runs = useProba((s) => s.runs).filter((r) => inScope(r.appKey));
  const flaky = useProba((s) => s.flaky).filter((f) => inScope(f.appKey));
  const toggleQ = useProba((s) => s.toggleQuarantine);

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Runs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{runs.length} runs · {flaky.length} flaky tracked</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Your execution history. Each run keeps per-step verdicts, screenshots, console and network logs, and a replay
          clip that is saved whenever the run fails.
        </p>
      </div>

      <div className="rounded-lg ring-1 ring-hairline bg-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="hairline-b bg-panel/40">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground font-mono">
              <th className="px-3 py-2">Run</th>
              <th className="px-2 py-2">Env</th>
              <th className="px-2 py-2">Build</th>
              <th className="px-2 py-2">Started</th>
              <th className="px-2 py-2 text-right">Duration</th>
              <th className="px-2 py-2 w-28 text-center">P / F / B</th>
              <th className="px-2 py-2 w-40">Pass-rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-accent/40 cursor-pointer">
                <td className="px-3 py-2.5"><Link to="/runs/$runId" params={{ runId: r.id }} className="font-mono text-[12px] text-primary hover:underline">{r.id}</Link></td>
                <td className="px-2 py-2.5 font-mono text-[12px] text-muted-foreground">{r.environment}</td>
                <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground">{r.buildRef}</td>
                <td className="px-2 py-2.5 text-xs font-mono text-muted-foreground">
                  {<TimeAgo date={r.startedAt} />}
                  {r.visualDiff?.video && <span className="ml-1.5 inline-flex items-center gap-0.5 text-fail" title="failure clip"><Film className="h-3 w-3" /></span>}
                </td>
                <td className="px-2 py-2.5 tabular-nums text-right text-muted-foreground">{(r.durationMs / 1000).toFixed(1)}s</td>
                <td className="px-2 py-2.5 text-center font-mono text-xs">
                  <span className="text-pass">{r.passed}</span> <span className="text-muted-foreground">/</span> <span className="text-fail">{r.failed}</span> <span className="text-muted-foreground">/</span> <span className="text-warn">{r.blocked}</span>
                </td>
                <td className="px-2 py-2.5"><PassRateBar passed={r.passed} failed={r.failed} blocked={r.blocked} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg ring-1 ring-hairline bg-card">
        <div className="px-4 py-2.5 hairline-b flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warn" />
          <h2 className="text-sm font-medium">Flaky</h2>
          <span className="text-xs font-mono text-muted-foreground">{flaky.length} tracked</span>
        </div>
        {flaky.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No flaky tests. Stay vigilant.</div>
        ) : (
          <ul className="divide-y divide-hairline">
            {flaky.map((f) => (
              <li key={f.caseId} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <Link to="/tests/$testId" params={{ testId: f.caseId }} className="text-[13px] font-medium truncate text-primary hover:underline block">{f.title}</Link>
                  <div className="text-xs text-muted-foreground font-mono">root cause: {f.rootCause}</div>
                </div>
                <div className="text-xs font-mono">
                  <span className="text-warn">flakiness {(f.score * 100).toFixed(0)}%</span>
                </div>
                <div className="text-xs font-mono text-muted-foreground">SLA: {<TimeAgo date={f.slaDueAt} />}</div>
                <div className={`text-xs font-mono px-1.5 py-0.5 rounded ring-1 ${f.quarantined ? "ring-warn/30 text-warn bg-warn/10" : "ring-hairline text-muted-foreground"}`}>
                  {f.quarantined ? "QUARANTINED" : "active"}
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toggleQ(f.caseId)}>
                  {f.quarantined ? "Un-quarantine" : "Quarantine"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
