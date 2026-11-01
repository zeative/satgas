import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage, type IntegrationsSearch } from "@/features/integrations/integrations-page";

export const Route = createFileRoute("/_app/integrations")({
  // Defaults stay out of the URL: a bare /integrations is Connectors · Discover.
  validateSearch: (search: Record<string, unknown>): IntegrationsSearch => ({
    tab: search.tab === "agents" ? "agents" : undefined,
    view: search.view === "yours" ? "yours" : undefined,
    connector: typeof search.connector === "string" && /^[a-z0-9-]{1,40}$/.test(search.connector) ? search.connector : undefined,
    agent: search.agent === "claude" || search.agent === "codex" ? search.agent : undefined,
  }),
  component: IntegrationsPage,
});
