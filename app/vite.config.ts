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
  },
  server: {
    port: 5173,
    host: true,
  },
});
