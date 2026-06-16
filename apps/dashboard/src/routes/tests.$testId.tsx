import { TimeAgo } from "@/components/ui-extras/time-ago";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Play, Plus, Trash2, GripVertical, ChevronDown, ChevronRight,
  Camera, Check, Loader2, Copy, Download, Film, ExternalLink,
} from "lucide-react";
import { ActionCombobox } from "@/components/ui-extras/action-combobox";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "test";
function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
import { formatDistanceToNow } from "date-fns";

import { useProba, newId } from "@/lib/mock/store";
import {
  StatusPill, PolarityBadge, KindBadge, TechniqueBadge, LifecycleBadge,
} from "@/components/ui-extras/badges";
import { CodeBlock } from "@/components/ui-extras/code-block";
import { LocatorEditor } from "@/components/ui-extras/locator-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toCanonical, toGherkin, toPlaywright } from "@/lib/artifact-sync";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AssertionType, Step, StepKind, Polarity, Lifecycle, Technique, Verdict } from "@/lib/mock/types";

export const Route = createFileRoute("/tests/$testId")({
  head: ({ params }) => ({
    meta: [
      { title: `Test ${params.testId} · Proba` },
      { name: "description", content: "Edit a test recorded by the agent — steps, assertions, and the synced artifact trinity." },
    ],
  }),
  component: TestEditor,
});

function TestEditor() {
  const { testId } = Route.useParams();
  const navigate = useNavigate();
  const test = useProba((s) => s.tests.find((t) => t.id === testId));
  const patchTest = useProba((s) => s.patchTest);
  const deleteTest = useProba((s) => s.deleteTest);
  const patchStep = useProba((s) => s.patchStep);
  const addStep = useProba((s) => s.addStep);
  const removeStep = useProba((s) => s.removeStep);
  const reorderSteps = useProba((s) => s.reorderSteps);
  const requirements = useProba((s) => s.requirements);
  const runs = useProba((s) => s.runs);
  const refresh = useProba((s) => s.refresh);

  type ReplayInfo = { runId: string; total: number; passed: number; failed: number; blocked: number; failures: { ordinal: number; kind: string; action: string; description?: string; message: string }[] };
  const [savedFlash, setSavedFlash] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [running, setRunning] = useState(false);
  const [replayResult, setReplayResult] = useState<ReplayInfo | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [openArtifact, setOpenArtifact] = useState<"gherkin" | "json" | "ts" | null>(null);
  const lastTitleRef = useRef<string | undefined>(test?.title);

  // autosave flash
  useEffect(() => {
    if (!test) return;
    if (lastTitleRef.current !== test.title) {
      lastTitleRef.current = test.title;
      setSavedFlash(true);
      const t = setTimeout(() => setSavedFlash(false), 1000);
      return () => clearTimeout(t);
    }
  }, [test?.title, test]);

  const triggerPulse = () => { setPulse((n) => n + 1); };

  const linkedReqs = useMemo(
    () => (test ? requirements.filter((r) => r.linkedCaseIds.includes(test.id)) : []),
    [requirements, test]
  );
  const runHistory = useMemo(
    () => (test ? runs.map((r) => ({ run: r, res: r.caseResults.find((c) => c.caseId === test.id) })).filter((x) => x.res) : []),
    [runs, test]
  );

  if (!test) {
    return (
      <div className="px-6 py-12 max-w-[1400px] mx-auto text-center">
        <p className="text-sm text-muted-foreground">Test not found.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate({ to: "/tests" })}>← Back to tests</Button>
      </div>
    );
  }

  const gherkin = toGherkin(test);
  const canonical = toCanonical(test);
  const playwright = toPlaywright(test);

  const onRun = async () => {
    setRunning(true);
    setReplayResult(null);
    try {
      const { replayTest } = await import("@/lib/api/replay.functions");
      const r = await replayTest({ data: { caseId: test.id } });
      setReplayResult(r);
      await refresh();
      if (r.failed + r.blocked === 0) toast.success(`Replay passed — ${r.passed}/${r.total} steps`);
      else toast.error(`Replay: ${r.failed} failed, ${r.blocked} blocked`);
    } catch (e) {
      setReplayResult({ runId: "", total: 0, passed: 0, failed: 0, blocked: 0, failures: [{ ordinal: 0, kind: "", action: "replay", message: String(e) }] });
      toast.error("Replay could not run");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="px-6 py-5 max-w-[1500px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate({ to: "/tests" })} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <Input
            value={test.title}
            onChange={(e) => { patchTest(test.id, { title: e.target.value }); }}
            className="text-lg font-semibold h-9 bg-transparent border-0 px-1 -ml-1 focus-visible:bg-card focus-visible:ring-1"
          />
          <p className="text-sm text-muted-foreground mt-1.5 mb-1 max-w-2xl leading-relaxed px-1">
            The test editor. Edit the steps below — each step's configuration (where to go, which element, what to type)
            is shown inline — and the Gherkin, JSON and Playwright artifacts regenerate from this canonical form.
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{test.id}</span>
            <span className="text-muted-foreground">·</span>
            <Select value={test.polarity} onValueChange={(v: Polarity) => patchTest(test.id, { polarity: v })}>
              <SelectTrigger className="h-6 w-auto gap-1.5 px-1.5 py-0 border-0 bg-transparent hover:bg-accent text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="positive">Positive</SelectItem><SelectItem value="negative">Negative</SelectItem></SelectContent>
            </Select>
            <Select value={test.lifecycle} onValueChange={(v: Lifecycle) => patchTest(test.id, { lifecycle: v })}>
              <SelectTrigger className="h-6 w-auto gap-1.5 px-1.5 py-0 border-0 bg-transparent hover:bg-accent text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="modified">Modified</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent>
            </Select>
            <Select value={test.technique} onValueChange={(v: Technique) => patchTest(test.id, { technique: v })}>
              <SelectTrigger className="h-6 w-auto gap-1.5 px-1.5 py-0 border-0 bg-transparent hover:bg-accent text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["ep", "bva", "decision", "pairwise", "state", "exploratory", "manual"] as Technique[]).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <StatusPill verdict={test.verdict} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("text-xs font-mono text-muted-foreground transition-opacity flex items-center gap-1", savedFlash ? "opacity-100" : "opacity-60")}>
            <Check className="h-3 w-3 text-pass" /> saved
          </span>
          <Button size="sm" className="h-8 gap-1.5" onClick={onRun} disabled={running}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run / Replay
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-fail border-fail/30 hover:bg-fail/10" onClick={() => { deleteTest(test.id); toast.success("Deleted"); navigate({ to: "/tests" }); }} aria-label="Delete test">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {replayResult && (
        <div className={cn(
          "rounded-lg ring-1 p-3 text-[13px]",
          replayResult.failed + replayResult.blocked === 0
            ? "ring-pass/30 bg-pass/10 text-pass"
            : "ring-fail/30 bg-fail/10",
        )}>
          {replayResult.failed + replayResult.blocked === 0 ? (
            <div className="flex items-center gap-2"><Check className="h-4 w-4" /> Replay passed — {replayResult.passed}/{replayResult.total} steps green.</div>
          ) : (
            <div className="space-y-2">
              <div className="font-medium text-fail flex items-center gap-2">
                Replay failed — {replayResult.passed} passed, {replayResult.failed} failed, {replayResult.blocked} blocked
              </div>
              <ul className="space-y-1.5">
                {replayResult.failures.map((f, i) => (
                  <li key={i} className="rounded-md bg-canvas/60 ring-1 ring-fail/20 px-2.5 py-1.5">
                    <div className="flex items-center gap-2 text-[12px]">
                      {f.kind && <span className="font-mono uppercase text-xs text-muted-foreground">{f.kind}</span>}
                      <span className="font-mono font-medium text-foreground">step {f.ordinal}: {f.action}</span>
                      {f.description && <span className="text-muted-foreground">— {f.description}</span>}
                    </div>
                    <div className="mt-1 font-mono text-[12px] text-fail whitespace-pre-wrap break-words">{f.message}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Steps editor + trinity */}
        <div className="space-y-4 min-w-0">
          <section className="rounded-lg ring-1 ring-hairline bg-card">
            <div className="flex items-center justify-between px-4 py-2.5 hairline-b">
              <h2 className="text-sm font-medium">Steps <span className="text-muted-foreground font-mono text-xs ml-1">{test.steps.length}</span></h2>
              <Button size="sm" variant="ghost" className="h-7 text-[12px] gap-1" onClick={() => {
                addStep(test.id, {
                  id: newId(), ordinal: test.steps.length + 1, kind: "web",
                  action: "click", description: "", target: { strategy: "role", value: "button" }, assertions: [],
                });
                triggerPulse();
              }}><Plus className="h-3 w-3" /> Add step</Button>
            </div>
            <ol className="divide-y divide-hairline">
              {test.steps.map((step, idx) => (
                <StepRow
                  key={step.id}
                  step={step}
                  index={idx}
                  total={test.steps.length}
                  onPatch={(p) => { patchStep(test.id, step.id, p); triggerPulse(); }}
                  onRemove={() => { removeStep(test.id, step.id); triggerPulse(); }}
                  onDuplicate={() => {
                    addStep(test.id, {
                      ...step, id: newId(), ordinal: test.steps.length + 1,
                      assertions: step.assertions.map((a) => ({ ...a, id: newId() })),
                    });
                    triggerPulse();
                  }}
                  onMove={(dir) => {
                    const ids = test.steps.map((s) => s.id);
                    const i = ids.indexOf(step.id);
                    const j = dir === "up" ? i - 1 : i + 1;
                    if (j < 0 || j >= ids.length) return;
                    [ids[i], ids[j]] = [ids[j], ids[i]];
                    reorderSteps(test.id, ids);
                    triggerPulse();
                  }}
                  dragging={dragIdx === idx}
                  onDragStart={() => setDragIdx(idx)}
                  onDropStep={() => {
                    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); return; }
                    const ids = test.steps.map((s) => s.id);
                    const [moved] = ids.splice(dragIdx, 1);
                    ids.splice(idx, 0, moved);
                    reorderSteps(test.id, ids);
                    setDragIdx(null);
                    triggerPulse();
                  }}
                />
              ))}
              {test.steps.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No steps yet. Add one or let the MCP recorder capture them in a session.
                </li>
              )}
            </ol>
          </section>

          {/* Artifact trinity */}
          <section className="rounded-lg ring-1 ring-hairline bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 hairline-b">
              <div>
                <h2 className="text-sm font-medium">Artifact trinity</h2>
                <p className="text-xs text-muted-foreground">Gherkin (intent) ↔ JSON (canonical truth) ↔ Playwright (executable). Editing steps regenerates all three.</p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => download(`${slugify(test.title)}.feature`, gherkin)}>
                  <Download className="h-3 w-3" /> .feature
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => download(`${slugify(test.title)}.spec.ts`, playwright)}>
                  <Download className="h-3 w-3" /> .spec.ts
                </Button>
              </div>
            </div>
            <div className="px-3 py-2.5 flex flex-wrap gap-1.5">
              {([["gherkin", "Gherkin"], ["json", "JSON"], ["ts", "Playwright"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOpenArtifact((o) => (o === key ? null : key))}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium ring-1 transition",
                    openArtifact === key
                      ? "ring-primary/40 bg-primary/10 text-primary"
                      : "ring-hairline text-muted-foreground hover:bg-muted/50",
                  )}
                  aria-expanded={openArtifact === key}
                >
                  {openArtifact === key ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {label}
                </button>
              ))}
            </div>
            {openArtifact ? (
              <div className="px-3 pb-3">
                {openArtifact === "gherkin" && (
                  <CodeBlock key={`g-${pulse}`} code={gherkin} lang="gherkin" pulse={pulse > 0} className="max-h-[440px]" />
                )}
                {openArtifact === "json" && (
                  <CodeBlock key={`j-${pulse}`} code={canonical} lang="json" pulse={pulse > 0} className="max-h-[440px]" />
                )}
                {openArtifact === "ts" && (
                  <CodeBlock key={`t-${pulse}`} code={playwright} lang="ts" pulse={pulse > 0} className="max-h-[440px]" />
                )}
              </div>
            ) : (
              <p className="px-4 pb-3 text-xs text-muted-foreground">
                Click a view to expand it, then use the copy button in its corner.
              </p>
            )}
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
            <h3 className="text-sm font-medium mb-2">Linked requirements</h3>
            {linkedReqs.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Not linked to any requirement yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {linkedReqs.map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-1.5 rounded-md ring-1 ring-primary/30 bg-primary/10 text-primary px-2 py-1 text-xs font-mono">{r.key}</span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
            <h3 className="text-sm font-medium mb-2">Run history</h3>
            {runHistory.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Not run yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {runHistory.slice(0, 6).map(({ run, res }) => (
                  <li key={run.id}>
                    <Link
                      to="/runs/$runId"
                      params={{ runId: run.id }}
                      className="flex items-center gap-2 text-[12px] rounded-md px-2 py-1 -mx-2 hover:bg-accent/50 transition-colors group"
                    >
                      <StatusPill verdict={res!.verdict} />
                      <span className="font-mono text-muted-foreground text-xs tabular-nums">{(res!.durationMs / 1000).toFixed(1)}s</span>
                      {run.visualDiff?.video && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-fail" title="failure clip available">
                          <Film className="h-3 w-3" /> clip
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs ml-auto">{<TimeAgo date={run.startedAt} />}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
            <h3 className="text-sm font-medium mb-2">Latest screenshot</h3>
            {test.latestScreenshot ? (
              <a href={test.latestScreenshot} target="_blank" rel="noreferrer">
                <img src={test.latestScreenshot} alt="latest run screenshot" className="w-full rounded-md ring-1 ring-hairline" />
              </a>
            ) : (
              <div className="aspect-video rounded-md ring-1 ring-hairline bg-panel flex items-center justify-center text-muted-foreground">
                <Camera className="h-5 w-5" />
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{test.latestScreenshot ? "From the last replay" : "Run a replay to capture one"} · {<TimeAgo date={test.updatedAt} />}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// the params each action expects, so the right fields always render (even when empty)
const PARAM_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  navigate: [{ key: "url", label: "URL", placeholder: "https://example.com or /path" }],
  fill: [{ key: "text", label: "Text to type", placeholder: "value entered into the field" }],
  select: [{ key: "value", label: "Option value", placeholder: "the option to select" }],
  request: [
    { key: "method", label: "Method", placeholder: "GET / POST / PUT / DELETE" },
    { key: "url", label: "URL", placeholder: "https://api.example.com/path" },
    { key: "body", label: "Body", placeholder: "request body (JSON)" },
  ],
};

/** one-line summary of a step's config, shown on the collapsed row */
function stepSummary(step: Step): string | undefined {
  const p = (step.params ?? {}) as Record<string, string>;
  if (step.action === "navigate") return p.url || undefined;
  if (step.action === "request") return [p.method, p.url].filter(Boolean).join(" ") || undefined;
  const t = step.target;
  const loc = t ? `${t.strategy}=${t.value}${t.name ? ` "${t.name}"` : ""}` : undefined;
  if (step.action === "fill") return [loc, p.text ? `← "${p.text}"` : ""].filter(Boolean).join(" ") || undefined;
  return loc;
}

function StepRow({
  step, index, total, onPatch, onRemove, onMove, onDuplicate, dragging, onDragStart, onDropStep,
}: {
  step: Step; index: number; total: number;
  onPatch: (p: Partial<Step>) => void;
  onRemove: () => void;
  onMove: (dir: "up" | "down") => void;
  onDuplicate: () => void;
  dragging?: boolean;
  onDragStart?: () => void;
  onDropStep?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  return (
    <li
      className={cn("px-3 py-2.5 transition-colors", dragging && "opacity-40", over && "bg-primary/5 ring-1 ring-inset ring-primary/30")}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDropStep?.(); }}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center pt-1.5 gap-0.5">
          <div
            draggable
            onDragStart={onDragStart}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">{step.ordinal}</span>
        </div>

        <button onClick={() => setOpen((o) => !o)} className="pt-1.5 text-muted-foreground hover:text-foreground" aria-label="Toggle step">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <Select value={step.kind} onValueChange={(v: StepKind) => onPatch({ kind: v })}>
          <SelectTrigger className="h-7 w-[80px] text-xs font-mono uppercase"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="web">web</SelectItem><SelectItem value="api">api</SelectItem><SelectItem value="db">db</SelectItem></SelectContent>
        </Select>
        <KindBadge kind={step.kind} className="mt-1" />

        <div className="flex-1 min-w-0 space-y-1.5">
          <ActionCombobox kind={step.kind} value={step.action} onChange={(v) => onPatch({ action: v })} />
          <Input
            value={step.description ?? ""}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="Given / When / Then description…"
            className="h-7 text-[12px]"
          />
          {!open && stepSummary(step) && (
            <button
              onClick={() => setOpen(true)}
              className="block w-full text-left text-xs font-mono text-muted-foreground truncate hover:text-foreground"
              title="Edit step config"
            >
              {stepSummary(step)}
            </button>
          )}
          {!open && step.action === "wait" && (
            <span className="block text-xs text-muted-foreground">waits for the page to settle (network idle)</span>
          )}
          {!open && step.action !== "wait" && !stepSummary(step) && (PARAM_FIELDS[step.action] || step.kind === "web") && (
            <button onClick={() => setOpen(true)} className="block text-left text-xs text-warn/80 hover:text-warn">
              ⚠ needs config — set {PARAM_FIELDS[step.action]?.[0]?.label.toLowerCase() ?? "a target"}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onDuplicate} aria-label="Duplicate step">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-fail" onClick={onRemove} aria-label="Delete step">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 ml-12 space-y-3">
          {step.kind === "web" && (
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Target locator</div>
              <LocatorEditor value={step.target} onChange={(v) => onPatch({ target: v })} />
            </div>
          )}
          {(() => {
            const schema = PARAM_FIELDS[step.action] ?? [];
            const params = (step.params ?? {}) as Record<string, string>;
            // schema-expected fields first (always shown), then any extra existing keys
            const extra = Object.keys(params).filter((k) => !schema.some((f) => f.key === k));
            if (schema.length === 0 && extra.length === 0) return null;
            return (
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
                  {step.action === "navigate" ? "Where to go" : "Inputs"}
                </div>
                <div className="space-y-1.5">
                  {schema.map((f) => (
                    <div key={f.key}>
                      <div className="text-xs text-muted-foreground mb-0.5">{f.label}</div>
                      <Input
                        value={params[f.key] ?? ""}
                        onChange={(e) => onPatch({ params: { ...params, [f.key]: e.target.value } })}
                        placeholder={f.placeholder}
                        className="h-7 text-[12px] font-mono"
                      />
                    </div>
                  ))}
                  {extra.map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-20">{k}</span>
                      <Input value={params[k]} onChange={(e) => onPatch({ params: { ...params, [k]: e.target.value } })} className="h-7 text-[12px] font-mono" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Assertions <span className="ml-1 text-muted-foreground/70">{step.assertions.length}</span></div>
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => onPatch({ assertions: [...step.assertions, { id: newId(), type: "dom", spec: "visible" }] })}
              >+ add assertion</button>
            </div>
            {step.assertions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No assertions on this step.</p>
            ) : (
              <ul className="space-y-1">
                {step.assertions.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <Select value={a.type} onValueChange={(v: AssertionType) => onPatch({ assertions: step.assertions.map((x) => x.id === a.id ? { ...x, type: v } : x) })}>
                      <SelectTrigger className="h-7 w-[100px] text-xs font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent>{(["dom","visual","layout","a11y","http","schema","db_row","sla"] as AssertionType[]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={a.spec} onChange={(e) => onPatch({ assertions: step.assertions.map((x) => x.id === a.id ? { ...x, spec: e.target.value } : x) })} className="h-7 text-[12px] font-mono flex-1" />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-fail" onClick={() => onPatch({ assertions: step.assertions.filter((x) => x.id !== a.id) })} aria-label="Remove assertion">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
