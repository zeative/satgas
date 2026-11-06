import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/config/settings-page";

export const Route = createFileRoute("/_app/config/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: "security" } => (search.tab === "security" ? { tab: "security" } : {}),
  component: SettingsPage,
});
