import { createFileRoute } from "@tanstack/react-router";
import { MissionPage } from "@/features/missions/mission-page";

export const Route = createFileRoute("/boards/$boardId")({
  // ?task= opens the board with that task selected, as the Pipeline's cards link to it.
  validateSearch: (search: Record<string, unknown>): { task?: string } => ({
    task: typeof search.task === "string" && /^[\w:.-]{1,80}$/.test(search.task) ? search.task : undefined,
  }),
  component: function Board() {
    const { boardId } = Route.useParams();
    const { task } = Route.useSearch();
    return <MissionPage missionId={boardId} focusTask={task} />;
  },
});
