import "@fontsource-variable/inter";
import "@fontsource-variable/sora/wght.css";
import "./styles/index.css";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/context/theme-provider";
import { bindNavigate } from "@/lib/actions";
import { router } from "./router";
import { watchAuth } from "./stores/auth";
import { connect } from "./stores/runs";

// Before anything fetches, so the first refused call already shows the sign-in screen.
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
