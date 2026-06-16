import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { Database, GitBranch, Trello, Github, Box, CheckCircle2, Activity, FolderOpen, KeyRound, Plus, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchAppConfig, fetchSettings, fetchSystemInfo, mutate } from "@/lib/api/proba.functions";
import { useProba } from "@/lib/mock/store";

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
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Configure the workbench — where the store lives, visual-diff thresholds, automation toggles, and how external
          trackers are wired.
        </p>
      </div>

      <Section title="System" description="Live status of this workbench — read directly from the store.">
        {sys ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Database className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <Label className="text-xs uppercase font-mono text-muted-foreground">SQLite store</Label>
                <p className="text-[12px] font-mono break-all text-foreground/90">{sys.dbPath}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono text-muted-foreground">Node {sys.nodeVersion}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {Object.entries(sys.counts).map(([k, v]) => (
                <div key={k} className="rounded-md ring-1 ring-hairline bg-panel/50 px-2.5 py-2 text-center">
                  <div className="text-lg font-semibold tabular-nums">{v}</div>
                  <div className="text-xs uppercase tracking-wider font-mono text-muted-foreground">{k}</div>
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
                  {i.default && <span className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-pass"><CheckCircle2 className="h-3 w-3" />active</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{i.desc}</p>
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
                <Label className="text-xs uppercase font-mono text-muted-foreground">Pixel threshold · {threshold}% of pixels</Label>
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
              <p className="text-xs text-muted-foreground mt-0.5">Creates a board ticket with a title, the failing step, and a screenshot.</p>
            </div>
            <Switch checked={settings.autoBugTask} onCheckedChange={(v) => save({ autoBugTask: v })} />
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        )}
      </Section>

      <Section title="Test accounts & variables" description="Per-app credentials and values you reference in steps as {{account.<name>.<field>}} or {{var.<name>}} — resolved at run time, so the same flow runs against different accounts and no secret is baked into a test artifact.">
        <AccountsConfig />
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
    </div>
  );
}

interface AccountView { name: string; fields: Record<string, string>; secret: boolean }
interface VarView { name: string; value: string; secret: boolean }

function AccountsConfig() {
  const apps = useProba((s) => s.apps);
  const activeAppKey = useProba((s) => s.activeAppKey);
  const appKey = activeAppKey ?? "";
  const appName = apps.find((a) => a.key === appKey)?.name ?? appKey;

  const [cfg, setCfg] = useState<{ accounts: AccountView[]; vars: VarView[]; authNames: string[] } | null>(null);
  const reload = () => { if (appKey) void fetchAppConfig({ data: { appKey } }).then((c) => setCfg(c as { accounts: AccountView[]; vars: VarView[]; authNames: string[] })); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [appKey]);

  const [accName, setAccName] = useState("");
  const [rows, setRows] = useState<{ k: string; v: string }[]>([{ k: "email", v: "" }, { k: "password", v: "" }]);
  const [varName, setVarName] = useState("");
  const [varValue, setVarValue] = useState("");

  const copy = (s: string) => { void navigator.clipboard.writeText(s); toast.success("Copied"); };

  const saveAccount = () => {
    if (!appKey || !accName.trim()) { toast.error("Name the account first"); return; }
    const fields = Object.fromEntries(rows.filter((r) => r.k.trim()).map((r) => [r.k.trim(), r.v]));
    void mutate({ data: { op: "setAccount", args: { appKey, name: accName.trim(), fields, secret: true } } })
      .then(() => { toast.success(`Account "${accName.trim()}" saved`); setAccName(""); setRows([{ k: "email", v: "" }, { k: "password", v: "" }]); reload(); });
  };
  const saveVar = () => {
    if (!appKey || !varName.trim()) { toast.error("Name the variable first"); return; }
    void mutate({ data: { op: "setVar", args: { appKey, name: varName.trim(), value: varValue, secret: false } } })
      .then(() => { toast.success(`Variable "${varName.trim()}" saved`); setVarName(""); setVarValue(""); reload(); });
  };
  const del = (type: "account" | "var", name: string) => {
    void mutate({ data: { op: "deleteConfig", args: { appKey, type, name } } }).then(() => { toast.success("Removed"); reload(); });
  };
  const clearAuth = (name: string) => {
    void mutate({ data: { op: "clearAuth", args: { appKey, name } } }).then(() => { toast.success("Auth forgotten"); reload(); });
  };

  if (!appKey) {
    return <p className="text-xs text-muted-foreground">Pick a project and surface in the top bar — accounts and variables are stored per app.</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">Scope: <span className="font-mono text-foreground/90">{appName}</span> <span className="opacity-60">({appKey})</span></p>

      {/* existing */}
      {cfg && (cfg.accounts.length > 0 || cfg.vars.length > 0) && (
        <div className="space-y-2">
          {cfg.accounts.map((a) => (
            <div key={`a-${a.name}`} className="rounded-md ring-1 ring-hairline bg-panel/50 p-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-warn" />
                <span className="text-sm font-medium font-mono">{a.name}</span>
                <button className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={() => copy(`{{account.${a.name}.email}}`)}>
                  <Copy className="h-3 w-3" /> {`{{account.${a.name}.…}}`}
                </button>
                <button className="ml-auto text-muted-foreground hover:text-fail" aria-label="Remove account" onClick={() => del("account", a.name)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(a.fields).map(([k, v]) => (
                  <span key={k} className="text-xs font-mono"><span className="text-muted-foreground">{k}:</span> {v}</span>
                ))}
              </div>
            </div>
          ))}
          {cfg.vars.map((v) => (
            <div key={`v-${v.name}`} className="rounded-md ring-1 ring-hairline bg-panel/50 p-3 flex items-center gap-2">
              <span className="text-sm font-mono">{v.name}</span>
              <span className="text-xs font-mono text-muted-foreground">= {v.value}</span>
              <button className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={() => copy(`{{var.${v.name}}}`)}>
                <Copy className="h-3 w-3" /> {`{{var.${v.name}}}`}
              </button>
              <button className="ml-auto text-muted-foreground hover:text-fail" aria-label="Remove variable" onClick={() => del("var", v.name)}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* captured auth (storageState) — log in once, reuse across runs */}
      <div className="rounded-md ring-1 ring-hairline bg-panel/30 p-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 text-pass" />
          <span className="text-[13px] font-medium">Captured login</span>
        </div>
        {cfg && cfg.authNames.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {cfg.authNames.map((n) => (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 text-pass"><CheckCircle2 className="h-3 w-3" /> auth saved</span>
                <span className="font-mono text-muted-foreground">{n}</span>
                <button className="ml-auto text-muted-foreground hover:text-fail" onClick={() => clearAuth(n)}>forget</button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Replays and new sessions for this app start already logged in — no re-login steps needed.</p>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">No saved login yet. In an MCP session, log in once then call <code className="font-mono">proba_save_auth</code> — the session state is captured here and reused on every replay.</p>
        )}
      </div>

      {/* add account */}
      <div className="rounded-md ring-1 ring-hairline p-3 space-y-2">
        <Label className="text-xs uppercase font-mono text-muted-foreground">New account</Label>
        <Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="name — e.g. client / admin / pro" className="h-8 text-[13px] font-mono" />
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={r.k} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} placeholder="field (email)" className="h-8 text-[13px] font-mono w-40" />
              <Input value={r.v} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} placeholder="value" className="h-8 text-[13px] font-mono flex-1" />
              <button className="text-muted-foreground hover:text-fail" aria-label="Remove field" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button className="text-xs text-primary inline-flex items-center gap-1 hover:underline" onClick={() => setRows((rs) => [...rs, { k: "", v: "" }])}><Plus className="h-3 w-3" /> add field</button>
        </div>
        <Button size="sm" onClick={saveAccount}>Save account</Button>
      </div>

      {/* add var */}
      <div className="rounded-md ring-1 ring-hairline p-3 space-y-2">
        <Label className="text-xs uppercase font-mono text-muted-foreground">New variable</Label>
        <div className="flex items-center gap-2">
          <Input value={varName} onChange={(e) => setVarName(e.target.value)} placeholder="name (baseURL)" className="h-8 text-[13px] font-mono w-40" />
          <Input value={varValue} onChange={(e) => setVarValue(e.target.value)} placeholder="value (https://app.test)" className="h-8 text-[13px] font-mono flex-1" />
          <Button size="sm" onClick={saveVar}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg ring-1 ring-hairline bg-card p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
