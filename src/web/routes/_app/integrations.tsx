import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage, type IntegrationsSearch } from "@/features/integrations/integrations-page";
import { PACKS, type PackId } from "../../../shared/skills";
import { toolDef } from "../../../shared/tools";

export const Route = createFileRoute("/_app/integrations")({
  // Defaults stay out of the URL: a bare /integrations is Connectors · Discover.
  validateSearch: (search: Record<string, unknown>): IntegrationsSearch => ({
    tab: search.tab === "agents" || search.tab === "skills" || search.tab === "tools" || search.tab === "channels" ? search.tab : undefined,
    view: search.view === "yours" ? "yours" : undefined,
    connector: typeof search.connector === "string" && /^[a-z0-9-]{1,40}$/.test(search.connector) ? search.connector : undefined,
    agent: search.agent === "claude" || search.agent === "codex" ? search.agent : undefined,
    skill: typeof search.skill === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(search.skill) ? search.skill : undefined,
    tool: typeof search.tool === "string" && toolDef.has(search.tool) ? search.tool : undefined,
    pack: typeof search.pack === "string" && Object.hasOwn(PACKS, search.pack) ? (search.pack as PackId) : undefined,
  }),
  component: IntegrationsPage,
});
