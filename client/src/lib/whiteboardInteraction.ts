import {
  getChangedFields,
  getShapeBounds,
  moveShape,
  resizeShape,
  type Point,
} from "./geometry";
import { makeOperationId } from "./operations";
import type { HistoryEntry, ResizeHandle, Shape, Tool } from "../types";

export type Interaction =
  | { mode: "idle" }
  | { mode: "draw"; tool: Exclude<Tool, "select" | "text">; start: Point; draft: Shape }
  | { mode: "move"; start: Point; before: Shape; last: Shape }
  | { mode: "resize"; start: Point; handle: ResizeHandle; before: Shape; last: Shape };

export const defaultInteraction: Interaction = { mode: "idle" };

export function updateDraftFromPointer(
  current: Extract<Interaction, { mode: "draw" }>,
  point: Point,
): Shape {
  const dx = point.x - current.start.x;
  const dy = point.y - current.start.y;

  if (current.draft.type === "line") {
    return { ...current.draft, x2: point.x, y2: point.y, updatedAt: Date.now() };
  }

  return {
    ...current.draft,
    x: Math.min(current.start.x, point.x),
    y: Math.min(current.start.y, point.y),
    width: Math.abs(dx),
    height: Math.abs(dy),
    updatedAt: Date.now(),
  } as Shape;
}

export function moveFromPointer(
  current: Extract<Interaction, { mode: "move" }>,
  point: Point,
): Shape {
  return moveShape(
    current.before,
    point.x - current.start.x,
    point.y - current.start.y,
  );
}

export function resizeFromPointer(
  current: Extract<Interaction, { mode: "resize" }>,
  point: Point,
): Shape {
  return resizeShape(
    current.last,
    current.handle,
    current.before,
    point.x - current.start.x,
    point.y - current.start.y,
  );
}

export function isMeaningfulDraft(shape: Shape): boolean {
  if (shape.type === "line") {
    return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) > 4;
  }

  const bounds = getShapeBounds(shape);
  return bounds.width > 4 && bounds.height > 4;
}

export function buildTransformHistory(before: Shape, after: Shape): HistoryEntry | null {
  const forwardPatch = getChangedFields(before, after);
  if (Object.keys(forwardPatch).length === 0) {
    return null;
  }

  return {
    forward: {
      id: makeOperationId(),
      kind: "update_shape",
      shapeId: before.id,
      patch: forwardPatch,
    },
    inverse: {
      id: makeOperationId(),
      kind: "update_shape",
      shapeId: before.id,
      patch: getChangedFields(after, before),
    },
  };
}
