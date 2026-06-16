import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import {
  LayoutDashboard, KanbanSquare, FlaskConical, Target, PlayCircle, Radio, Settings, Layers,
  Search, Plus, Command as CommandIcon, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectSwitcher } from "@/components/project-switcher";

const NAV = [
  { to: "/",             label: "Overview",     icon: LayoutDashboard },
  { to: "/board",        label: "Board",        icon: KanbanSquare },
  { to: "/tests",        label: "Tests",        icon: FlaskConical },
  { to: "/suites",       label: "Suites",       icon: Layers },
  { to: "/requirements", label: "Requirements", icon: Target },
  { to: "/runs",         label: "Runs",         icon: PlayCircle },
  { to: "/sessions",     label: "Sessions",     icon: Radio },
  { to: "/settings",     label: "Settings",     icon: Settings },
] as const;

function McpStatus({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 text-[11px] text-muted-foreground", collapsed && "justify-center")}>
      <span className="status-dot status-dot-pulse text-pass" style={{ background: "currentColor" }} />
      {!collapsed && <span className="font-mono">MCP: connected</span>}
    </div>
  );
}

function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <aside
      className={cn(
        "shrink-0 flex flex-col bg-sidebar hairline-r transition-[width] duration-150",
        collapsed ? "w-[56px]" : "w-[220px]"
      )}
    >
      <div className={cn("h-14 flex items-center hairline-b px-3", collapsed && "justify-center")}>
        <Link to="/" className="flex items-center gap-2 group">
          <div className="h-7 w-7 rounded-md bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <span className="text-primary font-mono text-[13px] font-bold">P</span>
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-[13px] font-semibold tracking-tight">Proba</div>
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">QA workbench</div>
            </div>
          )}
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5" role="navigation">
        <TooltipProvider delayDuration={300}>
          {NAV.map((item) => {
            const active = isActive(item.to);
            const Inner = (
              <Link
                to={item.to}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-md text-[13px] px-2.5 py-1.5 transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />}
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>{Inner}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.to}>{Inner}</div>
            );
          })}
        </TooltipProvider>
      </nav>

      <div className="hairline-t p-2 space-y-2">
        <McpStatus collapsed={collapsed} />
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          <ThemeToggle compact={collapsed} />
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function Breadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean);
  const root = NAV.find((n) => n.to === `/${parts[0] ?? ""}`)?.label ?? "Overview";
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground font-mono text-xs">proba</span>
      <span className="text-muted-foreground">/</span>
      <span className="font-medium">{root}</span>
      {parts.length > 1 && (
        <>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground font-mono text-xs truncate max-w-[260px]">{parts.slice(1).join("/")}</span>
        </>
      )}
    </div>
  );
}

function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <header className="h-14 hairline-b flex items-center px-5 gap-4 bg-canvas/80 backdrop-blur sticky top-0 z-30">
      <Breadcrumb />
      <ProjectSwitcher />
      <div className="flex-1" />
      <button
        onClick={onOpenPalette}
        className="hidden md:flex items-center gap-2 rounded-md px-2.5 h-8 ring-1 ring-hairline bg-panel/50 text-[12px] text-muted-foreground hover:text-foreground hover:ring-border w-[280px]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="font-mono text-[10px] ring-1 ring-hairline rounded px-1 py-0.5 bg-canvas">⌘K</kbd>
      </button>
      <Button size="sm" className="h-8 gap-1.5">
        <Plus className="h-3.5 w-3.5" /> New
      </Button>
    </header>
  );
}

export function AppShell({ children, onOpenPalette }: { children: ReactNode; onOpenPalette: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 900) setCollapsed(true); };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-canvas text-foreground">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenPalette={onOpenPalette} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

export { CommandIcon };
