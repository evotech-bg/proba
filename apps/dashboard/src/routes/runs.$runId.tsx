import { TimeAgo } from "@/components/ui-extras/time-ago";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Camera, Terminal, Globe, Film, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { useProba } from "@/lib/mock/store";
import { PassRateBar } from "@/components/ui-extras/bars";
import { StatusPill, KindBadge } from "@/components/ui-extras/badges";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/runs/$runId")({
  head: ({ params }) => ({
    meta: [{ title: `Run ${params.runId} · Proba` }],
  }),
  component: RunDetail,
});

function RunDetail() {
  const { runId } = Route.useParams();
  const run = useProba((s) => s.runs.find((r) => r.id === runId));
  const tests = useProba((s) => s.tests);
  const approveBaseline = useProba((s) => s.approveBaseline);
  const resetBaseline = useProba((s) => s.resetBaseline);
  const navigate = useNavigate();
  const [diffOpacity, setDiffOpacity] = useState([60]);

  if (!run) return <div className="p-12 text-center text-sm">Run not found</div>;

  // cache-bust so a just-written screenshot is never served from a stale 404
  const bust = (u?: string) => (u ? `${u}?v=${run.id}` : undefined);
  const shots = (run.caseResults.flatMap((cr) => cr.steps.map((s) => s.evidence?.screenshot).filter(Boolean)) as string[]).map((u) => bust(u)!);
  const vd = run.visualDiff;
  const baseline = bust(vd?.baseline) ?? shots[0];
  const actual = bust(vd?.actual) ?? shots[shots.length - 1];
  const diffImg = bust(vd?.diff);

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate({ to: "/runs" })} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Run <span className="font-mono">{run.id}</span></h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{run.environment} · {run.buildRef} · {<TimeAgo date={run.startedAt} />} · {(run.durationMs / 1000).toFixed(1)}s</p>
        </div>
        <div className="text-[12px] font-mono"><span className="text-pass">{run.passed} pass</span> · <span className="text-fail">{run.failed} fail</span> · <span className="text-warn">{run.blocked} blocked</span></div>
      </div>

      <PassRateBar passed={run.passed} failed={run.failed} blocked={run.blocked} className="h-1.5" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-4">
        <div className="rounded-lg ring-1 ring-hairline bg-card overflow-hidden">
          <div className="px-4 py-2.5 hairline-b"><h2 className="text-sm font-medium">Case results</h2></div>
          <ul className="divide-y divide-hairline">
            {run.caseResults.map((cr) => {
              const t = tests.find((x) => x.id === cr.caseId);
              return (
                <li key={cr.caseId} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <StatusPill verdict={cr.verdict} />
                    {t ? (
                      <Link to="/tests/$testId" params={{ testId: cr.caseId }} className="flex-1 text-[13px] font-medium truncate text-primary hover:underline">{t.title}</Link>
                    ) : (
                      <span className="flex-1 text-[13px] font-medium truncate">{cr.caseId}</span>
                    )}
                    <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{(cr.durationMs / 1000).toFixed(1)}s</span>
                  </div>
                  <ol className="mt-2 ml-2 space-y-1">
                    {cr.steps.map((s, i) => {
                      const step = t?.steps.find((st) => st.id === s.stepId);
                      return (
                        <li key={s.stepId} className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                          <span className="tabular-nums w-5">{i + 1}.</span>
                          {step && <KindBadge kind={step.kind} />}
                          <span className="flex-1 truncate text-foreground/80">{step?.action ?? "—"}</span>
                          <span className="tabular-nums">{s.durationMs}ms</span>
                          <StatusPill verdict={s.verdict} />
                        </li>
                      );
                    })}
                  </ol>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
            <h2 className="text-sm font-medium mb-3">Evidence</h2>
            <Tabs defaultValue={vd?.video ? "trace" : "screenshot"}>
              <TabsList className="grid grid-cols-4 h-8">
                <TabsTrigger value="screenshot" className="text-[10px] gap-1"><Camera className="h-3 w-3" /> Shots</TabsTrigger>
                <TabsTrigger value="trace" className="text-[10px] gap-1">
                  <Film className="h-3 w-3" /> Clip
                  {vd?.video && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-fail" />}
                </TabsTrigger>
                <TabsTrigger value="console" className="text-[10px] gap-1"><Terminal className="h-3 w-3" /> Console</TabsTrigger>
                <TabsTrigger value="network" className="text-[10px] gap-1"><Globe className="h-3 w-3" /> Net</TabsTrigger>
              </TabsList>
              <TabsContent value="screenshot" className="mt-3">
                {actual ? (
                  <div className="space-y-2">
                    <a href={actual} target="_blank" rel="noreferrer"><img src={actual} alt="final step" className="w-full rounded ring-1 ring-hairline" /></a>
                    {shots.length > 1 && (
                      <div className="flex gap-1.5 overflow-x-auto">
                        {shots.map((src, i) => (
                          <a key={i} href={src} target="_blank" rel="noreferrer" className="shrink-0">
                            <img src={src} alt={`step ${i + 1}`} className="h-12 rounded ring-1 ring-hairline" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video rounded ring-1 ring-hairline bg-panel flex items-center justify-center text-muted-foreground"><Camera className="h-6 w-6" /></div>
                )}
              </TabsContent>
              <TabsContent value="trace" className="mt-3">
                {vd?.video ? (
                  <div className="space-y-1.5">
                    <video src={`${vd.video}?v=${run.id}`} controls className="w-full rounded ring-1 ring-fail/30" />
                    <p className="text-[10px] text-muted-foreground font-mono">Replay clip · captured because this run failed</p>
                  </div>
                ) : (
                  <div className="aspect-video rounded ring-1 ring-hairline bg-panel flex flex-col items-center justify-center gap-1 text-muted-foreground">
                    <Film className="h-6 w-6" />
                    <span className="text-[11px]">A clip is recorded and kept only when a run fails.</span>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="console" className="rounded ring-1 ring-hairline bg-panel mt-3 p-3 font-mono text-[11px] text-muted-foreground max-h-64 overflow-auto">
                {vd?.console?.length ? (
                  vd.console.map((c, i) => (
                    <div key={i} className={cn("break-all", c.type === "error" ? "text-fail" : "text-warn")}>[{c.type}] {c.text}</div>
                  ))
                ) : (
                  <div className="text-muted-foreground/60">No console errors or warnings captured.</div>
                )}
              </TabsContent>
              <TabsContent value="network" className="rounded ring-1 ring-hairline bg-panel mt-3 p-3 font-mono text-[11px] text-muted-foreground max-h-64 overflow-auto">
                {vd?.network?.length ? (
                  vd.network.map((n, i) => (
                    <div key={i} className="text-fail break-all">{n.method} {n.url} · {n.status}</div>
                  ))
                ) : (
                  <div className="text-muted-foreground/60">No failed requests (≥400) captured.</div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium">Visual diff</h2>
              <div className="flex items-center gap-2">
                {vd?.ssim !== undefined && (
                  <span className={cn("text-[11px] font-mono", vd.ssim >= 0.99 ? "text-pass" : vd.ssim >= 0.95 ? "text-warn" : "text-fail")}>
                    SSIM {vd.ssim.toFixed(4)}
                  </span>
                )}
                {vd?.diffPixels !== undefined && (
                  <span className={cn("text-[11px] font-mono", vd.diffPixels === 0 ? "text-pass" : "text-warn")}>
                    {vd.diffPixels === 0 ? "pixel-identical" : `${vd.diffPixels.toLocaleString()} px differ`}
                  </span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              {vd?.firstBaseline ? "Baseline captured — re-run to compare." : vd?.diffError ? vd.diffError : "Baseline · actual · diff"}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                {baseline ? <img src={baseline} alt="baseline" className="w-full rounded ring-1 ring-hairline" /> : <div className="aspect-video rounded ring-1 ring-hairline bg-panel" />}
                <p className="text-[10px] font-mono text-muted-foreground mt-1 text-center">Baseline</p>
              </div>
              <div>
                {actual ? <img src={actual} alt="actual" className="w-full rounded ring-1 ring-hairline" /> : <div className="aspect-video rounded ring-1 ring-hairline bg-panel" />}
                <p className="text-[10px] font-mono text-muted-foreground mt-1 text-center">Actual</p>
              </div>
              <div>
                {diffImg ? (
                  <img src={diffImg} alt="pixel diff" className="w-full rounded ring-1 ring-hairline" />
                ) : (
                  <div className="relative rounded ring-1 ring-hairline overflow-hidden bg-panel">
                    {baseline && <img src={baseline} alt="baseline" className="w-full block" />}
                    {actual && <img src={actual} alt="diff overlay" className="w-full block absolute inset-0" style={{ opacity: diffOpacity[0] / 100 }} />}
                    {!baseline && !actual && <div className="aspect-video" />}
                  </div>
                )}
                <p className="text-[10px] font-mono text-muted-foreground mt-1 text-center">Diff</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">Diff opacity · {diffOpacity[0]}%</div>
              <Slider value={diffOpacity} onValueChange={setDiffOpacity} min={0} max={100} step={1} />
            </div>
            {run.caseId && actual && (
              <div className="flex items-center gap-2 mt-3 pt-3 hairline-t">
                <Button size="sm" variant="outline" className="h-7 text-[12px] gap-1.5 text-pass border-pass/30 hover:bg-pass/10"
                  onClick={() => { approveBaseline(run.caseId!, vd?.actual ?? ""); toast.success("Baseline approved from this run"); }}>
                  <Check className="h-3.5 w-3.5" /> Approve as baseline
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[12px] gap-1.5 text-muted-foreground"
                  onClick={() => { resetBaseline(run.caseId!); toast.success("Baseline reset — next run re-captures"); }}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset baseline
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
