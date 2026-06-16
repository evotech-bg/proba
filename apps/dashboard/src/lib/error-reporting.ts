// Local error reporting for the dashboard's React error boundary. No telemetry, nothing leaves
// the machine — errors are logged to the console in the browser. Swap in your own sink if you want.
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[proba] render error", { route: window.location.pathname, ...context }, error);
}
