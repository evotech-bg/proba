import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { Database, GitBranch, Trello, Github, Box, CheckCircle2, Activity, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { fetchSettings, fetchSystemInfo, mutate } from "@/lib/api/proba.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Proba" }] }),
  component: SettingsPage,
});

const INTEGRATIONS = [
  { id: "embedded", name: "Embedded", desc: "Built-in tracker. Default. No external service.", icon: Box, default: true },
  { id: "jira",     name: "Jira",     desc: "Sync tasks with Jira issues — configure credentials in the MCP server env.", icon: GitBranch },
  { id: "trello",   name: "Trello",   desc: "Mirror the board into a Trello list — configure via MCP server env.",        icon: Trello },
  { id: "plane",    name: "Plane",    desc: "Open-source Jira alternative — configure via MCP server env.",                icon: GitBranch },
  { id: "github",   name: "GitHub",   desc: "Open issues from failing tests — configure via MCP server env.",              icon: Github },
];

interface SystemInfo {
  dbPath: string;
  nodeVersion: string;
  counts: Record<string, number>;
}
interface Settings {
  pixelThresholdPct: number;
  ignoreAntialias: boolean;
  requireLogin: boolean;
  autoBugTask: boolean;
  importDir: string;
}

function SettingsPage() {
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void fetchSystemInfo().then(setSys);
    void fetchSettings().then((s) => setSettings(s as Settings));
  }, []);

  const save = (patch: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    for (const [key, value] of Object.entries(patch)) {
      void mutate({ data: { op: "setSetting", args: { key, value } } });
    }
  };

  const threshold = settings?.pixelThresholdPct ?? 1;

  return (
    <div className="px-6 py-6 max-w-[1100px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Workbench configuration. Persisted in the local store.</p>
      </div>

      <Section title="System" description="Live status of this workbench — read directly from the store.">
        {sys ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Database className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <Label className="text-[10px] uppercase font-mono text-muted-foreground">SQLite store</Label>
                <p className="text-[12px] font-mono break-all text-foreground/90">{sys.dbPath}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-[11px] font-mono text-muted-foreground">Node {sys.nodeVersion}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {Object.entries(sys.counts).map(([k, v]) => (
                <div key={k} className="rounded-md ring-1 ring-hairline bg-panel/50 px-2.5 py-2 text-center">
                  <div className="text-lg font-semibold tabular-nums">{v}</div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">{k}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Loading system status…</p>
        )}
      </Section>

      <Section title="Tracker integrations" description="Outbound comments are stripped of assistant branding — your tracker stays clean.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {INTEGRATIONS.map((i) => (
            <div key={i.id} className="rounded-md ring-1 ring-hairline bg-panel/50 p-3 flex items-start gap-3">
              <i.icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{i.name}</span>
                  {i.default && <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-pass"><CheckCircle2 className="h-3 w-3" />active</span>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{i.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Visual-diff defaults" description="Applied on the next replay when comparing against a baseline.">
        {settings ? (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[11px] uppercase font-mono text-muted-foreground">Pixel threshold · {threshold}% of pixels</Label>
              </div>
              <Slider value={[threshold]} onValueChange={([v]) => save({ pixelThresholdPct: v })} min={0} max={20} step={1} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[12px]">Ignore antialiasing noise</Label>
              <Switch checked={settings.ignoreAntialias} onCheckedChange={(v) => save({ ignoreAntialias: v })} />
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        )}
      </Section>

      <Section title="Automation" description="Let the workbench turn failures into actionable tickets.">
        {settings ? (
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-[12px]">Auto-file a bug task when a replay fails</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Creates a board ticket with a title, the failing step, and a screenshot.</p>
            </div>
            <Switch checked={settings.autoBugTask} onCheckedChange={(v) => save({ autoBugTask: v })} />
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        )}
      </Section>

      <Section title="Imported tests" description="Point Proba at a folder of existing test files (Playwright .spec.ts / .test.ts or .feature). They appear read-only under Tests, marked (imported).">
        {settings ? (
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              defaultValue={settings.importDir}
              placeholder="/absolute/path/to/your/tests"
              className="h-8 text-[12px] font-mono"
              onBlur={(e) => { if (e.target.value !== settings.importDir) { save({ importDir: e.target.value.trim() }); toast.success("Import folder set — open Tests to see them"); } }}
            />
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        )}
      </Section>

      <Section title="Appearance" description="Switch between dark and light themes.">
        <div className="flex items-center gap-3"><ThemeToggle /></div>
      </Section>

      <Section title="Authentication" description="Preference is persisted; the login gate ships in a later release.">
        <div className="flex items-center justify-between">
          <Label className="text-[12px]">Require login</Label>
          <Switch
            checked={settings?.requireLogin ?? false}
            onCheckedChange={(v) => { save({ requireLogin: v }); toast.success(v ? "Login will be required (gate pending)" : "Login not required"); }}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg ring-1 ring-hairline bg-card p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
