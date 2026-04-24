import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vite config.
 *
 * The `@` alias → `src/` keeps imports short and refactor-safe. The
 * `global` define is a Solana-ecosystem workaround: several wallet
 * adapter deps assume Node globals exist in the browser.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    global: "globalThis",
    "process.env": "{}",
  },
  optimizeDeps: {
    // Force the browser-entry for `buffer` + `process` so they ship
    // real polyfills instead of the Node stubs Rollup might pick.
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
