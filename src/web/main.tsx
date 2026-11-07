import "@fontsource-variable/inter";
import "@fontsource-variable/sora/wght.css";
import "./styles/index.css";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/context/theme-provider";
import { bindNavigate } from "@/lib/actions";
import { lockPageZoom } from "@/lib/page-zoom";
import { reloadForNewBuild } from "@/lib/stale-build";
import { router } from "./router";
import { watchAuth } from "./stores/auth";
import { connect } from "./stores/runs";

// Vite reports a piece of code it could not load, which after an update means this tab runs the old build.
window.addEventListener("vite:preloadError", (e) => {
  if (reloadForNewBuild()) e.preventDefault();
});
// Before anything fetches, so the first refused call already shows the sign-in screen.
lockPageZoom(window);
watchAuth();
bindNavigate(router.navigate);
connect();

const root = document.getElementById("root");
if (!root) throw new Error("Satgas: #root element is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
