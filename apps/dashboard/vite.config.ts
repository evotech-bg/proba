import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: { host: "::", port: 8080, strictPort: true },
  // playwright (pulled by @proba/engine, used only in .server.ts replay) must NOT be pre-bundled
  // for the client — that breaks hydration. Exclude it from the client optimizer and keep the
  // native npm modules external on the server. @proba/* stay bundled so vite transpiles their TS.
  optimizeDeps: {
    exclude: ["@proba/engine", "@proba/overlay", "@proba/store", "@proba/codegen", "playwright", "better-sqlite3"],
  },
  ssr: { external: ["playwright", "better-sqlite3"] },
  plugins: [
    tsConfigPaths(),
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
    tailwindcss(),
  ],
});
