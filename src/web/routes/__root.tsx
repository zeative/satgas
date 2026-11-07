import { createRootRoute, type ErrorComponentProps, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { SearchProvider } from "@/context/search-provider";
import { SignIn } from "@/features/auth/sign-in";
import { t } from "@/i18n";
import { pageTitle } from "@/lib/page-title";
import { isStaleBuild, reloadForNewBuild } from "@/lib/stale-build";
import { useAuth } from "@/stores/auth";
import { useRuns } from "@/stores/runs";

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function Root() {
  const navigate = useNavigate();
  const signInNeeded = useAuth((s) => s.needed);
  const pathname = useLocation({ select: (l) => l.pathname });
  const board = useRuns((s) => s.run);
  const title = signInNeeded ? `${t.auth.title} · Satgas` : pageTitle(pathname, board);

  useEffect(() => {
    document.title = title;
  }, [title]);

  // "N" starts a new board from anywhere, unless the user is typing or a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "n" || isTyping(e.target)) return;
      if (document.querySelector("[role='dialog'], [role='alertdialog']")) return;
      // On a board, N places a sticky note instead.
      if (window.location.pathname.startsWith("/boards/")) return;
      e.preventDefault();
      void navigate({ to: "/" }).then(() => document.getElementById("mission")?.focus());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <SearchProvider>
      {signInNeeded ? <SignIn /> : <Outlet />}
      <Toaster duration={4000} />
    </SearchProvider>
  );
}

// A crash anywhere shows a way out instead of a blank page; boards live on the server, so a reload loses nothing.
function Crash({ error }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);
  // A tab left open across an update cannot load the new code, and loading the page again fixes it.
  useEffect(() => {
    if (isStaleBuild(error)) reloadForNewBuild();
  }, [error]);
  return (
    <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-medium">{t.crashTitle}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t.crashLead}</p>
      <p className="max-w-md truncate font-mono text-xs text-muted-foreground" title={message}>
        {message}
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => window.location.reload()}>
          {t.reload}
        </Button>
        <Button asChild size="sm" variant="secondary">
          <a href="/">{t.home}</a>
        </Button>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: Root,
  errorComponent: Crash,
  notFoundComponent: () => (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-lg font-medium">{t.notFoundTitle}</h1>
      <Button asChild size="sm" variant="secondary">
        <Link to="/">{t.home}</Link>
      </Button>
    </div>
  ),
});
