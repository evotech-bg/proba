import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, CheckCircle2, FlaskConical, ListTodo, PlayCircle, Target } from "lucide-react";
import { TimeAgo } from "@/components/ui-extras/time-ago";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useProba, useScopeFilter } from "@/lib/mock/store";
import { CoverageBar } from "@/components/ui-extras/bars";
import { StatusPill } from "@/components/ui-extras/badges";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview · Proba" },
      { name: "description", content: "Coverage, runs, tasks, and recent activity at a glance." },
    ],
  }),
  component: Overview,
});

function Stat({ label, value, sub, accent, to, children }: {
  label: string; value: import("react").ReactNode; sub?: string; accent?: "pass" | "fail" | "warn" | "default";
  to?: string; children?: React.ReactNode;
}) {
  const tone = accent === "fail" ? "text-fail" : accent === "warn" ? "text-warn" : accent === "pass" ? "text-pass" : "text-foreground";
  const inner = (
    <div className="rounded-lg ring-1 ring-hairline bg-card p-4 hover:ring-border transition-colors h-full">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">{label}</div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums tracking-tight", tone)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
  return to ? <Link to={to as never} className="block">{inner}</Link> : inner;
}

function trendData(passRates: number[]) {
  return passRates.map((p, i) => ({ d: `D${i + 1}`, pass: Math.round(p * 100) }));
}

function Overview() {
  const inScope = useScopeFilter();
  const s = useProba();
  const tests = s.tests.filter((x) => inScope(x.appKey));
  const requirements = s.requirements.filter((x) => inScope(x.appKey));
  const tasks = s.tasks.filter((x) => inScope(x.appKey));
  const runs = s.runs.filter((x) => inScope(x.appKey));
  const flaky = s.flaky.filter((x) => inScope(x.appKey));
  const activity = s.activity;
  const passed = runs[0]?.passed ?? 0;
  const failed = runs[0]?.failed ?? 0;
  const blocked = runs[0]?.blocked ?? 0;
  const total = passed + failed + blocked;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const covered = requirements.filter((r) => r.linkedCaseIds.length > 0).length;
  const coveragePct = requirements.length ? Math.round((covered / requirements.length) * 100) : 0;
  const lastRun = runs[0];
  const chart = trendData([0.62, 0.71, 0.79, 0.74, 0.82, 0.87, 0.83, 0.9, 0.86, 0.91, 0.88, total ? passed / total : 0.85]);
  const uncovered = requirements.filter((r) => r.linkedCaseIds.length === 0);

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tests.length} tests · {requirements.length} requirements · {runs.length} runs</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label="Requirement coverage" value={`${coveragePct}%`} sub={`${covered} of ${requirements.length}`} to="/requirements">
          <CoverageBar value={coveragePct} />
        </Stat>
        <Stat label="Tests passed" value={`${passed}/${total}`} sub={lastRun ? `Run ${lastRun.id}` : "no runs"} accent="pass" to="/runs" />
        <Stat label="Open tasks" value={String(openTasks)} sub={`${tasks.length} total`} to="/board">
          <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
        </Stat>
        <Stat label="Flaky" value={String(flaky.filter((f) => f.quarantined).length)} sub="quarantined" accent={flaky.length ? "warn" : "default"} to="/runs" />
        <Stat label="Last run" value={lastRun ? <TimeAgo date={lastRun.startedAt} addSuffix={false} /> : "—"} sub={lastRun?.environment} to="/runs" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg ring-1 ring-hairline bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium">Pass-rate trend</h2>
              <p className="text-[11px] text-muted-foreground">Last 12 runs · all environments</p>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer>
              <AreaChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="passGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-hairline)", borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="pass" stroke="var(--color-primary)" strokeWidth={2} fill="url(#passGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Uncovered requirements</h2>
          {uncovered.length === 0 ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-pass" /> Full coverage. Nice.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {uncovered.map((r) => (
                <Link key={r.id} to="/requirements" className="inline-flex items-center gap-1.5 rounded-md ring-1 ring-warn/30 bg-warn/10 text-warn px-2 py-1 text-[11px] font-mono hover:bg-warn/15">
                  <AlertTriangle className="h-3 w-3" />{r.key}
                </Link>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 hairline-t">
            <h2 className="text-sm font-medium mb-2">Recent activity</h2>
            <ul className="space-y-2">
              {activity.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link to="/runs/$runId" params={{ runId: a.id }} className="text-[12px] flex items-start gap-2 rounded-md px-2 py-1 -mx-2 hover:bg-accent/50 transition-colors">
                    <Activity className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <span className="font-medium">{a.actor}</span> <span className="text-muted-foreground">{a.action}</span>{" "}
                      {a.target && <span className="font-medium truncate">{a.target}</span>}
                      <div className="text-[10px] text-muted-foreground font-mono"><TimeAgo date={a.ts} /></div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-lg ring-1 ring-hairline bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 hairline-b">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Latest tests</h2>
          </div>
          <Link to="/tests" className="text-[11px] text-primary hover:underline">View all →</Link>
        </div>
        <ul className="divide-y divide-hairline">
          {tests.slice(0, 5).map((t) => (
            <li key={t.id}>
              <Link to="/tests/$testId" params={{ testId: t.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                <StatusPill verdict={t.verdict} />
                <span className="text-[13px] truncate flex-1">{t.title}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{t.steps.length} steps</span>
                <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-20 text-right"><TimeAgo date={t.updatedAt} /></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
