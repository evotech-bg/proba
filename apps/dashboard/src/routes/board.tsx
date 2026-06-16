import { TimeAgo } from "@/components/ui-extras/time-ago";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type DragEvent } from "react";
import { Plus, Trash2, X, Bug, ExternalLink, Film } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { useProba, newId, useScopeFilter } from "@/lib/mock/store";
import { PriorityDot } from "@/components/ui-extras/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Task, TaskStatus, Priority } from "@/lib/mock/types";

export const Route = createFileRoute("/board")({
  head: () => ({
    meta: [
      { title: "Board · Proba" },
      { name: "description", content: "QA work, organized. Drag cards across columns." },
    ],
  }),
  component: Board,
});

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo",        label: "Todo" },
  { status: "in_progress", label: "In Progress" },
  { status: "review",      label: "Review" },
  { status: "done",        label: "Done" },
  { status: "blocked",     label: "Blocked" },
];

function Board() {
  const inScope = useScopeFilter();
  const tasks = useProba((s) => s.tasks).filter((t) => inScope(t.appKey));
  const moveTask = useProba((s) => s.moveTask);
  const upsertTask = useProba((s) => s.upsertTask);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<TaskStatus | null>(null);
  const [newTitleFor, setNewTitleFor] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const onDragStart = (id: string) => (e: DragEvent) => {
    setDragging(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    if (dragging) {
      moveTask(dragging, status);
      toast.success("Moved");
    }
    setDragging(null); setHoverCol(null);
  };

  const addQuick = (status: TaskStatus) => {
    if (!newTitle.trim()) { setNewTitleFor(null); return; }
    upsertTask({
      id: newId(), title: newTitle.trim(), status, priority: "med",
      createdAt: new Date().toISOString(),
    });
    setNewTitle(""); setNewTitleFor(null); toast.success("Task added");
  };

  return (
    <div className="px-6 py-6 max-w-[1500px] mx-auto">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Board</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tasks.length} tasks · drag to move</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.status);
          const isHover = hoverCol === col.status;
          return (
            <div
              key={col.status}
              className={cn(
                "rounded-lg ring-1 ring-hairline bg-panel/40 flex flex-col min-h-[400px] transition-colors",
                isHover && "ring-primary/40 bg-primary/5"
              )}
              onDragOver={(e) => { e.preventDefault(); setHoverCol(col.status); }}
              onDragLeave={() => setHoverCol(null)}
              onDrop={onDrop(col.status)}
            >
              <div className="flex items-center justify-between px-3 py-2.5 hairline-b">
                <div className="flex items-center gap-2">
                  <h3 className="text-[12px] font-medium uppercase tracking-wider">{col.label}</h3>
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{items.length}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setNewTitleFor(col.status); setNewTitle(""); }} aria-label="Add task">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="p-2 space-y-2 flex-1 overflow-auto" role="list">
                {newTitleFor === col.status && (
                  <div className="rounded-md ring-1 ring-primary bg-card p-2">
                    <Input
                      autoFocus value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addQuick(col.status); if (e.key === "Escape") setNewTitleFor(null); }}
                      onBlur={() => addQuick(col.status)}
                      placeholder="Task title…" className="h-7 text-[12px]"
                    />
                  </div>
                )}
                {items.map((task) => (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={onDragStart(task.id)}
                    onClick={() => setOpenId(task.id)}
                    role="listitem"
                    className={cn(
                      "group cursor-pointer rounded-md ring-1 ring-hairline bg-card p-2.5 hover:ring-border hover:bg-card transition-colors",
                      dragging === task.id && "opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <PriorityDot p={task.priority} />
                      <p className="text-[13px] leading-snug flex-1">{task.title}</p>
                    </div>
                    {task.evidence?.screenshot && (
                      <img
                        src={`${task.evidence.screenshot}?v=${task.runId ?? task.id}`}
                        alt="failure screenshot"
                        className="mt-2 w-full h-20 object-cover object-top rounded ring-1 ring-fail/20"
                      />
                    )}
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-muted-foreground">
                      {task.evidence?.source === "replay" && (
                        <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded ring-1 ring-fail/30 text-fail bg-fail/5"><Bug className="h-2.5 w-2.5" />bug</span>
                      )}
                      {task.assignee && (
                        <span className="inline-flex items-center h-4 px-1.5 rounded bg-muted/60 text-muted-foreground">
                          {task.assignee}
                        </span>
                      )}
                      {task.caseId && (
                        <span className="inline-flex items-center h-4 px-1.5 rounded ring-1 ring-primary/30 text-primary bg-primary/5">test</span>
                      )}
                      {task.requirementId && (
                        <span className="inline-flex items-center h-4 px-1.5 rounded ring-1 ring-warn/30 text-warn bg-warn/5">req</span>
                      )}
                      <span className="ml-auto">{<TimeAgo date={task.createdAt} />}</span>
                    </div>
                  </article>
                ))}
                {items.length === 0 && newTitleFor !== col.status && (
                  <div className="text-[11px] text-muted-foreground text-center py-6">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TaskSheet openId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function TaskSheet({ openId, onClose }: { openId: string | null; onClose: () => void }) {
  const task = useProba((s) => s.tasks.find((t) => t.id === openId));
  const tests = useProba((s) => s.tests);
  const reqs = useProba((s) => s.requirements);
  const runs = useProba((s) => s.runs);
  const patchTask = useProba((s) => s.patchTask);
  const deleteTask = useProba((s) => s.deleteTask);

  if (!task) return null;
  const update = (p: Partial<Task>) => patchTask(task.id, p);
  const clip = task.runId ? runs.find((r) => r.id === task.runId)?.visualDiff?.video : undefined;

  return (
    <Sheet open={!!openId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">
            <Input value={task.title} onChange={(e) => update({ title: e.target.value })} className="text-sm font-medium" />
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4 text-sm">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">Description</label>
            <Textarea value={task.description ?? ""} onChange={(e) => update({ description: e.target.value })} placeholder="What needs to happen?" className="mt-1 text-[12px]" rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Status">
              <Select value={task.status} onValueChange={(v: TaskStatus) => update({ status: v })}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>{COLUMNS.map((c) => <SelectItem key={c.status} value={c.status}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={task.priority ?? "med"} onValueChange={(v: Priority) => update({ priority: v })}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="urgent">Urgent</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="med">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Assignee">
              <Input value={task.assignee ?? ""} onChange={(e) => update({ assignee: e.target.value })} className="h-8 text-[12px]" />
            </Field>
            <Field label="Linked test">
              <Select value={task.caseId ?? "none"} onValueChange={(v) => update({ caseId: v === "none" ? undefined : v })}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {tests.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Linked requirement">
              <Select value={task.requirementId ?? "none"} onValueChange={(v) => update({ requirementId: v === "none" ? undefined : v })}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {reqs.map((r) => <SelectItem key={r.id} value={r.id}>{r.key} · {r.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {task.caseId && (
            <div className="rounded-md ring-1 ring-hairline bg-panel p-2.5">
              <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-1">Linked test</div>
              <Link to="/tests/$testId" params={{ testId: task.caseId }} className="text-[12px] text-primary hover:underline">
                Open editor →
              </Link>
            </div>
          )}

          {task.evidence?.source === "replay" && (
            <div className="rounded-md ring-1 ring-fail/30 bg-fail/5 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-fail mb-1.5">
                <Bug className="h-3.5 w-3.5" /> Auto-filed from a failed replay
              </div>
              {task.evidence.failingStep && (
                <p className="text-[11px] text-muted-foreground">
                  Caught at step <span className="font-mono text-foreground">{task.evidence.failingStep.ordinal}</span>{" "}
                  ({task.evidence.failingStep.kind} {task.evidence.failingStep.action})
                  {task.evidence.failureCount && task.evidence.failureCount > 1 ? ` · ${task.evidence.failureCount} steps failed` : ""}
                </p>
              )}
              {task.evidence.failingStep?.message && (
                <p className="mt-1 text-[11px] font-mono text-fail/90 break-words">{task.evidence.failingStep.message}</p>
              )}
              {task.runId && (
                <Link to="/runs/$runId" params={{ runId: task.runId }} className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> View run
                </Link>
              )}
            </div>
          )}

          {clip && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-1.5">
                <Film className="h-3 w-3" /> Failure clip
              </div>
              <video src={`${clip}?v=${task.runId}`} controls className="w-full rounded ring-1 ring-fail/30" />
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-1.5">Screenshot</div>
            {task.evidence?.screenshot ? (
              <a href={`${task.evidence.screenshot}?v=${task.runId ?? task.id}`} target="_blank" rel="noreferrer">
                <img src={`${task.evidence.screenshot}?v=${task.runId ?? task.id}`} alt="failure" className="w-full rounded ring-1 ring-hairline" />
              </a>
            ) : (
              <div className="aspect-video rounded ring-1 ring-hairline bg-panel flex items-center justify-center text-[11px] text-muted-foreground">No screenshot</div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-1.5">Activity</div>
            <ul className="space-y-1.5 text-[11px] text-muted-foreground">
              <li>created · {<TimeAgo date={task.createdAt} />}</li>
            </ul>
          </div>

          <div className="pt-2 hairline-t flex justify-between">
            <Button variant="outline" size="sm" className="text-fail border-fail/30 hover:bg-fail/10" onClick={() => { deleteTask(task.id); onClose(); toast.success("Deleted"); }}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-3.5 w-3.5" /> Close</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
