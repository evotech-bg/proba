import { useState } from "react";
import { FolderKanban, Check, Plus, ChevronDown, Layers } from "lucide-react";
import { useProba } from "@/lib/mock/store";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Top-bar two-level scope picker: Project → Surface (app). Filters the whole dashboard. */
export function ProjectSwitcher() {
  const projects = useProba((s) => s.projects);
  const apps = useProba((s) => s.apps);
  const activeProjectKey = useProba((s) => s.activeProjectKey);
  const activeAppKey = useProba((s) => s.activeAppKey);
  const setScope = useProba((s) => s.setScope);
  const createProject = useProba((s) => s.createProject);
  const createApp = useProba((s) => s.createApp);

  const [newProject, setNewProject] = useState("");
  const [newApp, setNewApp] = useState("");

  // when a surface is active, its project is implied
  const appProject = activeAppKey ? apps.find((a) => a.key === activeAppKey)?.projectKey : undefined;
  const projectKey = activeProjectKey ?? appProject;
  const project = projects.find((p) => p.key === projectKey);
  const surfacesInProject = apps.filter((a) => a.projectKey === projectKey);
  const activeApp = apps.find((a) => a.key === activeAppKey);

  const projectLabel = project ? project.name : "All projects";
  const surfaceLabel = activeApp ? activeApp.name : "All surfaces";

  return (
    <div className="flex items-center gap-1.5">
      {/* PROJECT */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px] max-w-[180px]">
            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{projectLabel}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-[11px]">Project</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setScope({})}>
            <span className="flex-1">All projects</span>
            {!projectKey && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
          {projects.map((p) => (
            <DropdownMenuItem key={p.key} onClick={() => setScope({ projectKey: p.key })}>
              <span className="flex-1 truncate">{p.name}</span>
              {projectKey === p.key && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 flex gap-1.5" onKeyDown={(e) => e.stopPropagation()}>
            <Input
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              placeholder="New project…"
              className="h-7 text-[12px]"
              onKeyDown={(e) => { if (e.key === "Enter" && newProject.trim()) { createProject(newProject.trim()); setNewProject(""); } }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
              onClick={() => { if (newProject.trim()) { createProject(newProject.trim()); setNewProject(""); } }}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* SURFACE (app) — only meaningful inside a project */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px] max-w-[170px]" disabled={!projectKey}>
            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{projectKey ? surfaceLabel : "—"}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-[11px]">Surface</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setScope({ projectKey })}>
            <span className="flex-1">All surfaces</span>
            {!activeAppKey && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
          {surfacesInProject.map((a) => (
            <DropdownMenuItem key={a.key} onClick={() => setScope({ projectKey, appKey: a.key })}>
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground mr-1">{a.platform ?? a.key}</span>
              {activeAppKey === a.key && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
          {projectKey && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 flex gap-1.5" onKeyDown={(e) => e.stopPropagation()}>
                <Input
                  value={newApp}
                  onChange={(e) => setNewApp(e.target.value)}
                  placeholder="New surface…"
                  className="h-7 text-[12px]"
                  onKeyDown={(e) => { if (e.key === "Enter" && newApp.trim()) { createApp(projectKey, newApp.trim()); setNewApp(""); } }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                  onClick={() => { if (newApp.trim()) { createApp(projectKey, newApp.trim()); setNewApp(""); } }}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Small inline badge showing an entity's app/surface — for cards/rows. */
export function AppTag({ appKey, className }: { appKey?: string; className?: string }) {
  const apps = useProba((s) => s.apps);
  if (!appKey) return null;
  const app = apps.find((a) => a.key === appKey);
  return (
    <span className={cn("inline-flex items-center h-4 px-1.5 rounded ring-1 ring-hairline bg-panel text-[10px] font-mono text-muted-foreground", className)}>
      {app?.name ?? appKey}
    </span>
  );
}
