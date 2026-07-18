import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Client-only SPA. All core logic (protocol engine, agent, models) is
// framework-free TypeScript under src/core and runs in the browser, so the
// demo needs no backend and never depends on a live model.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
