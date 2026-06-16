import { TimeAgo } from "@/components/ui-extras/time-ago";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, FileCode, ChevronRight, ChevronDown } from "lucide-react";
import { fetchImportedTests } from "@/lib/api/proba.functions";
import { formatDistanceToNow } from "date-fns";

import { useProba, useScopeFilter } from "@/lib/mock/store";
import {
  StatusPill, PolarityBadge, LifecycleBadge, TechniqueBadge,
} from "@/components/ui-extras/badges";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { newId } from "@/lib/mock/store";
import { toast } from "sonner";

export const Route = createFileRoute("/tests/")({
  head: () => ({
    meta: [
      { title: "Tests · Proba" },
      { name: "description", content: "Every test the agent has recorded — review, edit, refine." },
    ],
  }),
  component: TestsList,
});

function TestsList() {
  const allTests = useProba((s) => s.tests);
  const inScope = useScopeFilter();
  const tests = allTests.filter((t) => inScope(t.appKey));
  const deleteTest = useProba((s) => s.deleteTest);
  const patchTest = useProba((s) => s.patchTest);
  const upsertTest = useProba((s) => s.upsertTest);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [polarity, setPolarity] = useState<string>("all");
  const [lifecycle, setLifecycle] = useState<string>("all");
  const [verdict, setVerdict] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<{ dir: string; files: { path: string; kind: string; tests: { title: string }[]; code: string }[] }>({ dir: "", files: [] });
  const [openFile, setOpenFile] = useState<string | null>(null);
  useEffect(() => { void fetchImportedTests().then((r) => setImported(r as typeof imported)); }, []);

  const rows = useMemo(() => tests.filter((t) =>
    (!q || t.title.toLowerCase().includes(q.toLowerCase()) || t.tags.some((x) => x.includes(q.toLowerCase()))) &&
    (polarity === "all" || t.polarity === polarity) &&
    (lifecycle === "all" || t.lifecycle === lifecycle) &&
    (verdict === "all" || t.verdict === verdict)
  ), [tests, q, polarity, lifecycle, verdict]);

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const onNew = () => {
    const id = `tc_${newId()}`;
    upsertTest({
      id, title: "Untitled test", polarity: "positive", technique: "ep",
      lifecycle: "draft", verdict: "not_run", tags: [], steps: [],
      updatedAt: new Date().toISOString(),
    });
    navigate({ to: "/tests/$testId", params: { testId: id } });
  };

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tests.length} total · {rows.length} shown</p>
        </div>
        <Button size="sm" onClick={onNew}>+ New test</Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tests, tags…" className="pl-8 h-8 text-[13px]" />
        </div>
        <Select value={polarity} onValueChange={setPolarity}><SelectTrigger className="h-8 w-[130px] text-[12px]"><SelectValue placeholder="Polarity" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All polarity</SelectItem><SelectItem value="positive">Positive</SelectItem><SelectItem value="negative">Negative</SelectItem></SelectContent>
        </Select>
        <Select value={lifecycle} onValueChange={setLifecycle}><SelectTrigger className="h-8 w-[130px] text-[12px]"><SelectValue placeholder="Lifecycle" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All lifecycle</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="modified">Modified</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent>
        </Select>
        <Select value={verdict} onValueChange={setVerdict}><SelectTrigger className="h-8 w-[130px] text-[12px]"><SelectValue placeholder="Verdict" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All verdict</SelectItem><SelectItem value="passed">Passed</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="blocked">Blocked</SelectItem><SelectItem value="not_run">Not run</SelectItem></SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">{selected.size} selected</span>
            <Button variant="outline" size="sm" className="h-7" onClick={() => { selected.forEach((id) => patchTest(id, { lifecycle: "retired" })); setSelected(new Set()); toast.success("Marked retired"); }}>Retire</Button>
            <Button variant="outline" size="sm" className="h-7 text-fail" onClick={() => { selected.forEach((id) => deleteTest(id)); setSelected(new Set()); toast.success("Deleted"); }}>Delete</Button>
          </div>
        )}
      </div>

      <div className="rounded-lg ring-1 ring-hairline bg-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="hairline-b bg-panel/40">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
              <th className="w-8 px-3 py-2"></th>
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2 w-16">Pol</th>
              <th className="px-2 py-2 w-24">Technique</th>
              <th className="px-2 py-2 w-24">Lifecycle</th>
              <th className="px-2 py-2 w-16 text-right">Steps</th>
              <th className="px-2 py-2 w-24">Verdict</th>
              <th className="px-2 py-2 w-32">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-accent/40 group cursor-pointer" onClick={() => navigate({ to: "/tests/$testId", params: { testId: t.id } })}>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                </td>
                <td className="px-2 py-2.5">
                  <div className="font-medium truncate">{t.title}</div>
                  {t.tags.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {t.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-[10px] font-mono text-muted-foreground">#{tag}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2.5"><PolarityBadge polarity={t.polarity} /></td>
                <td className="px-2 py-2.5"><TechniqueBadge technique={t.technique} /></td>
                <td className="px-2 py-2.5"><LifecycleBadge lifecycle={t.lifecycle} /></td>
                <td className="px-2 py-2.5 tabular-nums text-right text-muted-foreground">{t.steps.length}</td>
                <td className="px-2 py-2.5"><StatusPill verdict={t.verdict} /></td>
                <td className="px-2 py-2.5 text-[11px] font-mono text-muted-foreground">{<TimeAgo date={t.updatedAt} />}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-muted-foreground">No tests match those filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {imported.files.length > 0 && (
        <section className="rounded-lg ring-1 ring-hairline bg-card overflow-hidden">
          <div className="px-4 py-2.5 hairline-b flex items-center gap-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Imported</h2>
            <span className="text-[11px] font-mono text-muted-foreground">
              {imported.files.length} file{imported.files.length === 1 ? "" : "s"} · read-only · from {imported.dir}
            </span>
          </div>
          <ul className="divide-y divide-hairline">
            {imported.files.map((f) => {
              const open = openFile === f.path;
              return (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => setOpenFile(open ? null : f.path)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-accent/40"
                  >
                    {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="font-mono text-[12px] text-primary truncate">{f.path}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 rounded ring-1 ring-hairline bg-panel text-muted-foreground">{f.kind}</span>
                    <span className="text-[10px] font-mono text-muted-foreground ml-auto">{f.tests.length} test{f.tests.length === 1 ? "" : "s"} · imported</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-3 space-y-2">
                      <ul className="space-y-0.5 pl-6">
                        {f.tests.map((t, i) => (
                          <li key={i} className="text-[12px] flex items-center gap-2">
                            <span className="text-muted-foreground">•</span>
                            <span className="truncate">{t.title}</span>
                            <span className="text-[10px] font-mono text-muted-foreground/70">(imported)</span>
                          </li>
                        ))}
                        {f.tests.length === 0 && <li className="text-[11px] text-muted-foreground">No named tests parsed.</li>}
                      </ul>
                      <pre className="text-[10px] font-mono bg-panel ring-1 ring-hairline rounded p-2 max-h-72 overflow-auto whitespace-pre-wrap">{f.code}</pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
