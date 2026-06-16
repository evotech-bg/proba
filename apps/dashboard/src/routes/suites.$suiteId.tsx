import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, Play, Plus, Trash2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useProba } from "@/lib/mock/store";
import { StatusPill } from "@/components/ui-extras/badges";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/suites/$suiteId")({
  head: () => ({ meta: [{ title: "Suite · Proba" }] }),
  component: SuiteDetail,
});

function SuiteDetail() {
  const { suiteId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const suite = useProba((s) => s.suites.find((x) => x.id === suiteId));
  const tests = useProba((s) => s.tests);
  const addCaseToSuite = useProba((s) => s.addCaseToSuite);
  const removeCaseFromSuite = useProba((s) => s.removeCaseFromSuite);
  const deleteSuite = useProba((s) => s.deleteSuite);
  const refresh = useProba((s) => s.refresh);

  const addRef = useRef<string>("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ cases: number; casesPassed: number; casesFailed: number } | null>(null);

  if (!suite) {
    return (
      <div className="px-6 py-12 max-w-[1000px] mx-auto text-center">
        <p className="text-sm text-muted-foreground">Suite not found.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate({ to: "/suites" })}>← Back to suites</Button>
      </div>
    );
  }

  const cases = suite.caseIds.map((id) => tests.find((t) => t.id === id)).filter(Boolean) as typeof tests;
  const available = tests.filter((t) => !suite.caseIds.includes(t.id));

  const runSuite = async () => {
    setRunning(true); setResult(null);
    try {
      const { replaySuiteFn } = await import("@/lib/api/replay.functions");
      const r = await replaySuiteFn({ data: { suiteId } });
      setResult(r);
      await refresh();
      if (r.casesFailed === 0) toast.success(`Suite passed — ${r.casesPassed}/${r.cases} cases`);
      else toast.error(`Suite: ${r.casesFailed} of ${r.cases} cases failed`);
    } catch (e) {
      toast.error("Suite run could not start");
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="px-6 py-5 max-w-[1000px] mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate({ to: "/suites" })} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">{suite.name}</h1>
          <p className="text-[12px] text-muted-foreground font-mono mt-0.5">{suite.kind} · {cases.length} cases</p>
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={runSuite} disabled={running || cases.length === 0}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run suite
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-fail border-fail/30 hover:bg-fail/10" onClick={() => { deleteSuite(suite.id); toast.success("Deleted"); navigate({ to: "/suites" }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>

      {result && (
        <div className={cn("rounded-lg ring-1 p-3 text-[13px] flex items-center gap-2", result.casesFailed === 0 ? "ring-pass/30 bg-pass/10 text-pass" : "ring-fail/30 bg-fail/10 text-fail")}>
          {result.casesFailed === 0 ? <Check className="h-4 w-4" /> : null}
          Suite replay — {result.casesPassed} passed, {result.casesFailed} failed of {result.cases} cases.
        </div>
      )}

      <section className="rounded-lg ring-1 ring-hairline bg-card">
        <div className="flex items-center justify-between px-4 py-2.5 hairline-b">
          <h2 className="text-sm font-medium">Cases <span className="text-muted-foreground font-mono text-[11px] ml-1">{cases.length}</span></h2>
          <div className="flex gap-2">
            <Select onValueChange={(v) => { addRef.current = v; }}>
              <SelectTrigger className="h-7 w-[240px] text-[12px]"><SelectValue placeholder="Add a test…" /></SelectTrigger>
              <SelectContent>{available.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[12px]" onClick={() => { if (addRef.current) { addCaseToSuite(suite.id, addRef.current); router.invalidate(); } }}><Plus className="h-3 w-3" /> Add</Button>
          </div>
        </div>
        {cases.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No cases yet — add tests from the picker above.</div>
        ) : (
          <ul className="divide-y divide-hairline">
            {cases.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <StatusPill verdict={t.verdict} />
                <Link to="/tests/$testId" params={{ testId: t.id }} className="flex-1 text-[13px] text-primary hover:underline truncate">{t.title}</Link>
                <span className="text-[11px] text-muted-foreground font-mono">{t.steps.length} steps</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-fail" onClick={() => { removeCaseFromSuite(suite.id, t.id); router.invalidate(); }} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
