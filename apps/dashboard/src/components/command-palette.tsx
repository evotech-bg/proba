import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, KanbanSquare, FlaskConical, Target, PlayCircle, Radio, Settings,
  Plus, Moon, Sun, FilePlus2,
} from "lucide-react";
import { useProba, newId } from "@/lib/mock/store";
import { toast } from "sonner";

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate();
  const tests = useProba((s) => s.tests);
  const upsertTask = useProba((s) => s.upsertTask);
  const upsertTest = useProba((s) => s.upsertTest);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const go = (to: string) => { navigate({ to: to as never }); setOpen(false); };

  const toggleTheme = () => {
    const html = document.documentElement;
    const next = html.classList.contains("dark") ? "light" : "dark";
    html.classList.toggle("dark", next === "dark");
    localStorage.setItem("proba-theme", next);
    setOpen(false);
  };

  const createTask = () => {
    const id = newId();
    upsertTask({ id, title: "Untitled task", status: "todo", priority: "med", createdAt: new Date().toISOString() });
    toast.success("Task created");
    setOpen(false);
    navigate({ to: "/board" });
  };

  const createTest = () => {
    const id = `tc_${newId()}`;
    upsertTest({
      id, title: "Untitled test", polarity: "positive", technique: "ep",
      lifecycle: "draft", verdict: "not_run", tags: [], steps: [],
      updatedAt: new Date().toISOString(),
    });
    toast.success("Test created");
    setOpen(false);
    navigate({ to: "/tests/$testId", params: { testId: id } });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search tests, tasks, requirements… or run a command" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={createTask}><Plus className="h-3.5 w-3.5" /> Create task</CommandItem>
          <CommandItem onSelect={createTest}><FilePlus2 className="h-3.5 w-3.5" /> New test</CommandItem>
          <CommandItem onSelect={toggleTheme}>
            <Sun className="h-3.5 w-3.5 dark:hidden" /><Moon className="h-3.5 w-3.5 hidden dark:block" /> Toggle theme
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/")}><LayoutDashboard className="h-3.5 w-3.5" /> Overview</CommandItem>
          <CommandItem onSelect={() => go("/board")}><KanbanSquare className="h-3.5 w-3.5" /> Board</CommandItem>
          <CommandItem onSelect={() => go("/tests")}><FlaskConical className="h-3.5 w-3.5" /> Tests</CommandItem>
          <CommandItem onSelect={() => go("/requirements")}><Target className="h-3.5 w-3.5" /> Requirements</CommandItem>
          <CommandItem onSelect={() => go("/runs")}><PlayCircle className="h-3.5 w-3.5" /> Runs</CommandItem>
          <CommandItem onSelect={() => go("/sessions")}><Radio className="h-3.5 w-3.5" /> Sessions</CommandItem>
          <CommandItem onSelect={() => go("/settings")}><Settings className="h-3.5 w-3.5" /> Settings</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tests">
          {tests.map((t) => (
            <CommandItem
              key={t.id}
              onSelect={() => { navigate({ to: "/tests/$testId", params: { testId: t.id } }); setOpen(false); }}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              <span className="truncate">{t.title}</span>
              <span className="ml-auto text-[10px] font-mono text-muted-foreground">{t.id}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
