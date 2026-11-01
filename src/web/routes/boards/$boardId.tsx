import { createFileRoute } from "@tanstack/react-router";
import { MissionPage } from "@/features/missions/mission-page";

export const Route = createFileRoute("/boards/$boardId")({
  component: function Board() {
    const { boardId } = Route.useParams();
    return <MissionPage missionId={boardId} />;
  },
});
