import { createFileRoute } from "@tanstack/react-router";
import { MemoryPage } from "@/features/memory/memory-page";

export const Route = createFileRoute("/_app/memory")({
  // A bare /memory opens the Memory tab; ?tab=rules opens Rules, as the chat's rule lines link it.
  validateSearch: (search: Record<string, unknown>): { tab?: "rules" } => (search.tab === "rules" ? { tab: "rules" } : {}),
  component: MemoryPage,
});
