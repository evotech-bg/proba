import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { AppShell } from "../components/app-shell";
import { CommandPalette, useCommandPalette } from "../components/command-palette";
import { Toaster } from "../components/ui/sonner";
import { useProba } from "../lib/mock/store";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold tracking-tight">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">That route isn't part of the workbench.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Go to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportError(error, { boundary: "tanstack_root_error_component" }); }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Something failed to render</h1>
        <p className="mt-2 text-sm text-muted-foreground">The workbench hit an error in this view.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Try again
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Proba — QA workbench" },
      { name: "description", content: "MCP-driven QA workbench. Record, refine, and trust your tests." },
      { name: "author", content: "Proba" },
      { property: "og:title", content: "Proba — QA workbench" },
      { property: "og:description", content: "MCP-driven QA workbench. Record, refine, and trust your tests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const themeBootstrap = `
(function() {
  try {
    var t = localStorage.getItem('proba-theme');
    if (!t) t = 'dark';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) { document.documentElement.classList.add('dark'); }
})();
`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const palette = useCommandPalette();
  const refresh = useProba((s) => s.refresh);
  useEffect(() => { void refresh(); }, [refresh]);
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell onOpenPalette={() => palette.setOpen(true)}>
        <Outlet />
      </AppShell>
      <CommandPalette open={palette.open} setOpen={palette.setOpen} />
      <Toaster />
    </QueryClientProvider>
  );
}
