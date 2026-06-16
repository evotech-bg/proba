import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef } from "react";
import { Layers, Plus, ChevronRight } from "lucide-react";
import { useProba, useScopeFilter } from "@/lib/mock/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/suites/")({
  head: () => ({ meta: [{ title: "Suites · Proba" }] }),
  component: SuitesPage,
});

const KINDS = ["smoke", "sanity", "regression", "acceptance", "custom"];

function SuitesPage() {
  const inScope = useScopeFilter();
  const suites = useProba((s) => s.suites).filter((x) => inScope(x.appKey));
  const createSuite = useProba((s) => s.createSuite);
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<string>("smoke");

  const add = () => {
    const name = nameRef.current?.value.trim();
    if (!name) return;
    createSuite(name, kindRef.current);
    if (nameRef.current) nameRef.current.value = "";
    router.invalidate();
  };

  return (
    <div className="px-6 py-6 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Suites</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{suites.length} suites · group cases and run them together</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
            Bundle related tests into a suite and run them together to get a single pass/fail verdict across all of its
            cases in one go.
          </p>
        </div>
      </div>

      <section className="rounded-lg ring-1 ring-hairline bg-card p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-2">New suite</h2>
        <div className="flex gap-2">
          <Input ref={nameRef} placeholder="Suite name (e.g. Smoke)" className="h-8 flex-1" onKeyDown={(e) => e.key === "Enter" && add()} />
          <Select defaultValue="smoke" onValueChange={(v) => { kindRef.current = v; }}>
            <SelectTrigger className="h-8 w-[140px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="h-8 gap-1" onClick={add}><Plus className="h-3.5 w-3.5" /> Add</Button>
        </div>
      </section>

      <section className="rounded-lg ring-1 ring-hairline bg-card overflow-hidden">
        {suites.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground"><Layers className="h-6 w-6 mx-auto mb-2 opacity-50" />No suites yet. Create one above, then add tests to it.</div>
        ) : (
          <ul className="divide-y divide-hairline">
            {suites.map((s) => (
              <li key={s.id}>
                <Link to="/suites/$suiteId" params={{ suiteId: s.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40">
                  <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{s.kind} · {s.caseIds.length} cases</div>
                  </div>
                  <div className="text-xs font-mono"><span className="text-pass">{s.passed}✓</span> <span className="text-fail">{s.failed}✗</span></div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
