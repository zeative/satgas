import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/config/")({
  beforeLoad: () => {
    throw redirect({ to: "/config/settings", replace: true });
  },
});
