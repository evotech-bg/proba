import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { StepKind } from "@/lib/mock/types";

// Suggested actions per step kind. The combobox still accepts a custom typed value,
// so this is autocomplete-with-suggestions, not a hard constraint.
const ACTIONS: Record<StepKind, string[]> = {
  web: ["navigate", "click", "fill", "select", "check", "hover", "press", "wait", "expect", "upload", "scroll"],
  api: ["request"],
  db: ["query", "seed", "assertRows"],
};

export function ActionCombobox({ kind, value, onChange }: {
  kind: StepKind;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const options = ACTIONS[kind] ?? [];
  const exact = options.some((o) => o.toLowerCase() === search.toLowerCase());
  const commit = (v: string) => { if (v) { onChange(v); } setOpen(false); setSearch(""); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-7 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 text-[13px] font-mono hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span className={cn(!value && "text-muted-foreground")}>{value || "action…"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[230px] p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="Search or type custom…"
            value={search}
            onValueChange={setSearch}
            className="h-8 text-[12px]"
            onKeyDown={(e) => { if (e.key === "Enter" && search && !exact) { e.preventDefault(); commit(search); } }}
          />
          <CommandList>
            {search && !exact && (
              <CommandItem value={`use ${search}`} onSelect={() => commit(search)} className="text-[12px] font-mono">
                <span className="text-muted-foreground mr-1">Use</span> “{search}”
              </CommandItem>
            )}
            <CommandEmpty className="py-2 px-2 text-[12px] text-muted-foreground">Type a custom action, then Enter.</CommandEmpty>
            <CommandGroup heading={kind.toUpperCase()}>
              {options.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => commit(o)} className="text-[12px] font-mono">
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === o ? "opacity-100" : "opacity-0")} />
                  {o}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
