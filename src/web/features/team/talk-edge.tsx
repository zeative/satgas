import { BaseEdge, type Edge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@/lib/utils";

export type TalkEdgeData = { text: string; answered: boolean };
export type TalkEdgeType = Edge<TalkEdgeData, "talk">;

// How high the line arcs over the heads of the people between the two talking.
const ARC = 56;

// One teammate asking another: a dashed line arcs from the asker's head to the one asked, its dashes flowing that way,
// with the question in a small bubble on top. The answer flows back the same way and fades once it has been seen.
export const TalkEdge = memo(function TalkEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<TalkEdgeType>) {
  const top = Math.min(sourceY, targetY) - ARC;
  const path = `M ${sourceX} ${sourceY} C ${sourceX} ${top}, ${targetX} ${top}, ${targetX} ${targetY}`;
  // The middle of that curve, where the bubble sits.
  const x = (sourceX + targetX) / 2;
  const y = (sourceY + targetY) / 8 + (top * 3) / 4;
  return (
    <>
      <BaseEdge id={id} path={path} />
      {data?.text && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-none absolute max-w-52 truncate rounded-lg border bg-card px-2 py-1 text-[11px] text-card-foreground shadow-xs",
              data.answered && "satgas-talk-fade",
            )}
            style={{ transform: `translate(-50%, -100%) translate(${x}px, ${y - 6}px)` }}
          >
            {data.text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
