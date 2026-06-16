import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { Locator, LocatorStrategy } from "@/lib/mock/types";

const STRATEGIES: { v: LocatorStrategy; label: string; safe: boolean }[] = [
  { v: "role", label: "role", safe: true },
  { v: "testId", label: "testid", safe: true },
  { v: "label", label: "label", safe: true },
  { v: "text", label: "text", safe: true },
  { v: "placeholder", label: "placeholder", safe: true },
  { v: "css", label: "css", safe: false },
];

export function LocatorEditor({
  value, onChange, className,
}: { value?: Locator; onChange: (v: Locator) => void; className?: string }) {
  const [v, setV] = useState<Locator>(value ?? { strategy: "role", value: "" });
  const brittle = v.strategy === "css";
  const update = (patch: Partial<Locator>) => {
    const next = { ...v, ...patch };
    setV(next);
    onChange(next);
  };
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Select value={v.strategy} onValueChange={(s) => update({ strategy: s as LocatorStrategy })}>
          <SelectTrigger className="h-7 w-[120px] text-[12px] font-mono"><SelectValue /></SelectTrigger>
          <SelectContent>{STRATEGIES.map((s) => (
            <SelectItem key={s.v} value={s.v} className="font-mono text-[12px]">{s.label}{!s.safe && " ⚠"}</SelectItem>
          ))}</SelectContent>
        </Select>
        <Input
          value={v.value}
          onChange={(e) => update({ value: e.target.value })}
          placeholder="value"
          className="h-7 text-[12px] font-mono flex-1"
        />
        <Input
          value={v.name ?? ""}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="name (optional)"
          className="h-7 text-[12px] font-mono w-[180px]"
        />
      </div>
      {brittle && (
        <div className="flex items-start gap-2 text-xs text-warn rounded-md bg-warn/10 ring-1 ring-warn/25 px-2 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span><span className="font-medium">Brittle locator.</span> Prefer role / testid — Proba's recorder warns on positional css/xpath because they break under design changes.</span>
        </div>
      )}
    </div>
  );
}
