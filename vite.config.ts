// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

const localAcceptance = process.env.VITE_HLEIAS_LOCAL_ONLY === "1";

export default defineConfig({
  vite: {
    // The local wrapper supplies only status-derived public configuration.
    envDir: localAcceptance ? false : undefined,
    // Dedicated worktrees share installed dependencies through a symlink.
    // The map worker must be served from that exact resolved dependency root.
    ...(localAcceptance
      ? {
          server: {
            fs: {
              allow: [
                import.meta.dirname,
                realpathSync(resolve(import.meta.dirname, "node_modules")),
              ],
            },
          },
        }
      : {}),
    // MapLibre creates its own module worker at runtime. Vite's dependency
    // optimizer otherwise rewrites that worker to a transient prebundle path.
    optimizeDeps: { exclude: ["maplibre-gl"] },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
