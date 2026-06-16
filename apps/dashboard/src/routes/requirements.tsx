import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, X } from "lucide-react";
import { useProba, newId, useScopeFilter } from "@/lib/mock/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CoverageBar } from "@/components/ui-extras/bars";
import { StatusPill } from "@/components/ui-extras/badges";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/requirements")({
  head: () => ({
    meta: [
      { title: "Requirements · Proba" },
      { name: "description", content: "Requirements traceability matrix — every requirement, every linked test, every verdict." },
    ],
  }),
  component: Requirements,
});

function Requirements() {
  const inScope = useScopeFilter();
  const requirements = useProba((s) => s.requirements).filter((r) => inScope(r.appKey));
  const tests = useProba((s) => s.tests).filter((t) => inScope(t.appKey));
  const addRequirement = useProba((s) => s.addRequirement);
  const linkRequirement = useProba((s) => s.linkRequirement);
  const unlinkRequirement = useProba((s) => s.unlinkRequirement);

  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [linkReq, setLinkReq] = useState<string>("");
  const [linkCase, setLinkCase] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "covered" | "uncovered">("all");

  const covered = requirements.filter((r) => r.linkedCaseIds.length > 0).length;
  const pct = requirements.length ? Math.round((covered / requirements.length) * 100) : 0;

  const rows = requirements.filter((r) => filter === "all" || (filter === "covered" ? r.linkedCaseIds.length > 0 : r.linkedCaseIds.length === 0));

  const onAdd = () => {
    if (!key.trim() || !title.trim()) return;
    addRequirement({ id: newId(), key: key.trim().toUpperCase(), title: title.trim(), linkedCaseIds: [] });
    setKey(""); setTitle(""); toast.success("Requirement added");
  };

  const onLink = () => {
    if (!linkReq || !linkCase) return;
    linkRequirement(linkReq, linkCase);
    toast.success("Linked");
  };

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Requirements <span className="text-muted-foreground font-normal">· {covered}/{requirements.length} covered</span></h1>
          <p className="text-sm text-muted-foreground mt-0.5">Every requirement should be exercised by at least one positive and one negative test.</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
            Your traceability matrix — each requirement and the tests that cover it, so you can see at a glance what is
            verified and where the gaps are.
          </p>
        </div>
      </div>

      <CoverageBar value={pct} className="h-2" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Add requirement</h2>
          <div className="flex items-center gap-2">
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="AUTH-3" className="h-8 w-28 font-mono text-[12px] uppercase" />
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Requirement title" className="h-8 text-[13px] flex-1" />
            <Button size="sm" onClick={onAdd}>Add</Button>
          </div>
        </div>
        <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Link requirement → test</h2>
          <div className="flex items-center gap-2">
            <Select value={linkReq} onValueChange={setLinkReq}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Requirement…" /></SelectTrigger>
              <SelectContent>{requirements.map((r) => <SelectItem key={r.id} value={r.id}>{r.key}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={linkCase} onValueChange={setLinkCase}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Test…" /></SelectTrigger>
              <SelectContent>{tests.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" onClick={onLink}><Link2 className="h-3.5 w-3.5" /> Link</Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Filter:</span>
        {(["all", "covered", "uncovered"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "h-7 px-2.5 rounded text-[12px] capitalize",
              filter === f ? "bg-accent text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
            )}
          >{f}</button>
        ))}
      </div>

      <div className="rounded-lg ring-1 ring-hairline bg-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="hairline-b bg-panel/40">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground font-mono">
              <th className="px-3 py-2 w-24">Key</th>
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2 w-44">Coverage</th>
              <th className="px-2 py-2">Linked tests</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r) => {
              const isCov = r.linkedCaseIds.length > 0;
              const linked = tests.filter((t) => r.linkedCaseIds.includes(t.id));
              return (
                <tr key={r.id} className="hover:bg-accent/30">
                  <td className="px-3 py-2.5"><span className="font-mono text-[12px]">{r.key}</span></td>
                  <td className="px-2 py-2.5">{r.title}</td>
                  <td className="px-2 py-2.5">
                    {isCov ? (
                      <span className="inline-flex items-center gap-1.5 text-pass text-[12px]"><CheckCircle2 className="h-3.5 w-3.5" /> covered by {linked.length}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-warn text-[12px]"><AlertTriangle className="h-3.5 w-3.5" /> uncovered</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {linked.map((t) => (
                        <span key={t.id} className="inline-flex items-center gap-1 rounded ring-1 ring-hairline bg-panel text-xs pl-1.5 pr-1 py-0.5">
                          <Link to="/tests/$testId" params={{ testId: t.id }} className="hover:text-primary truncate max-w-[200px]">{t.title}</Link>
                          <button onClick={() => unlinkRequirement(r.id, t.id)} aria-label="Unlink" className="text-muted-foreground hover:text-fail">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg ring-1 ring-hairline bg-card p-4">
        <h2 className="text-sm font-medium mb-3">Traceability</h2>
        <ul className="space-y-2">
          {requirements.flatMap((r) =>
            (r.linkedCaseIds.length === 0
              ? [<li key={r.id} className="text-[12px] font-mono flex items-center gap-2 text-warn"><AlertTriangle className="h-3.5 w-3.5" /> {r.key} → <span className="text-muted-foreground italic">no test</span></li>]
              : r.linkedCaseIds.map((cid) => {
                  const t = tests.find((x) => x.id === cid);
                  if (!t) return null;
                  return (
                    <li key={`${r.id}-${cid}`} className="text-[12px] font-mono flex items-center gap-2">
                      <span className="text-muted-foreground">{r.key}</span>
                      <span className="text-muted-foreground">→</span>
                      <Link to="/tests/$testId" params={{ testId: t.id }} className="hover:text-primary truncate max-w-[400px]">{t.title}</Link>
                      <span className="ml-auto"><StatusPill verdict={t.verdict} /></span>
                    </li>
                  );
                }))
          )}
        </ul>
      </div>
    </div>
  );
}
