import { createFileRoute } from "@tanstack/react-router";
import { UsagePage } from "@/features/config/usage-page";
import { USAGE_VIEWS, type UsageView } from "../../../../shared/usage";

export const Route = createFileRoute("/_app/config/usage")({
  validateSearch: (search: Record<string, unknown>): { view?: UsageView } => {
    const view = USAGE_VIEWS.find((v) => v === search.view);
    return view ? { view } : {};
  },
  component: UsagePage,
});
