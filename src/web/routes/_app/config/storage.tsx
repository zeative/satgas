import { createFileRoute, redirect } from "@tanstack/react-router";

// Storage became a tab of Usage; the old address still lands there.
export const Route = createFileRoute("/_app/config/storage")({
  beforeLoad: () => {
    throw redirect({ to: "/config/usage", search: { view: "storage" }, replace: true });
  },
});
