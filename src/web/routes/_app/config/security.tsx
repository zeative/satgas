import { createFileRoute, redirect } from "@tanstack/react-router";

// Security became a tab of Settings; the old address still lands there.
export const Route = createFileRoute("/_app/config/security")({
  beforeLoad: () => {
    throw redirect({ to: "/config/settings", search: { tab: "security" }, replace: true });
  },
});
