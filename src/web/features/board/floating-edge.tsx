import { BaseEdge, type EdgeProps, getBezierPath, getSmoothStepPath, type InternalNode, Position, useInternalNode } from "@xyflow/react";
import { memo } from "react";
import { type Box, connectorEnds, type Side } from "./floating";

const POSITION: Record<Side, Position> = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };

function boxOf(node: InternalNode | undefined): Box | null {
  const w = node?.measured.width ?? node?.width;
  const h = node?.measured.height ?? node?.height;
  if (!node || !w || !h) return null;
  return { ...node.internals.positionAbsolute, w, h };
}

// A Miro-style connector: it picks the sides that face each other and follows both cards live while they move.
export const FloatingEdge = memo(function FloatingEdge({ id, source, target, style, markerEnd, interactionWidth, data }: EdgeProps) {
  const a = boxOf(useInternalNode(source));
  const b = boxOf(useInternalNode(target));
  if (!a || !b) return null;
  const end = connectorEnds(a, b, !!data?.elbow);
  const ends = {
    sourceX: end.sx,
    sourceY: end.sy,
    sourcePosition: POSITION[end.from],
    targetX: end.tx,
    targetY: end.ty,
    targetPosition: POSITION[end.to],
  };
  const [path] = data?.elbow ? getSmoothStepPath({ ...ends, borderRadius: 10, offset: 20 }) : getBezierPath(ends);
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      {/* The flow between results ends in small rings on both cards, like a wire plugged in at each end. */}
      {data?.dots && (
        <>
          <circle cx={end.sx} cy={end.sy} r={3} className="satgas-flow-dot" />
          <circle cx={end.tx} cy={end.ty} r={3} className="satgas-flow-dot" />
        </>
      )}
    </>
  );
});
