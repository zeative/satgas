import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const web = path.resolve(import.meta.dirname, "src/web");
const api = `http://127.0.0.1:${process.env.SATGAS_PORT ?? 4317}`;

export default defineConfig({
  root: web,
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: path.join(web, "routes"),
      generatedRouteTree: path.join(web, "routeTree.gen.ts"),
    }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": web } },
  build: { outDir: path.resolve(import.meta.dirname, "dist/web"), emptyOutDir: true },
  server: {
    // Off Vite's default 5173 so Satgas can run next to other Vite projects.
    port: Number(process.env.SATGAS_WEB_PORT ?? 5317),
    strictPort: true,
    proxy: {
      "/api": api,
      "/ws": { target: api.replace("http", "ws"), ws: true },
    },
  },
});
