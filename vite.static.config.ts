import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { browserLocalConfig } from "./src/lib/supabase/browser-local-config";

export default defineConfig(({ mode }) => {
  const env = mode === "local-test" ? process.env : loadEnv(mode, import.meta.dirname, "VITE_");
  browserLocalConfig({ ...env, DEV: mode === "development", MODE: mode });
  return {
    root: "cloudflare-static-src",
    envDir: mode === "local-test" ? false : import.meta.dirname,
    publicDir: resolve(import.meta.dirname, "public"),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "src"),
      },
    },
    build: {
      emptyOutDir: true,
      outDir: mode === "local-test" ? "../local-test-dist" : "../cloudflare-static-dist",
    },
  };
});
