import {
  getChangedFields,
  angleBetween,
  getBoundsCenter,
  getShapeBounds,
  normalizeBounds,
  moveShape,
  resizeBounds,
  resizeShape,
  rotateShapeAround,
  scaleShapeToBounds,
  type Point,
  type Bounds,
} from "./geometry";
import { makeOperationId } from "./operations";
import type { HistoryEntry, ResizeHandle, Shape, ShapeType } from "../types";

export type Interaction =
  | { mode: "idle" }
  | { mode: "box_select"; start: Point; current: Point }
  | { mode: "draw"; tool: Exclude<ShapeType, "text">; start: Point; draft: Shape }
  | { mode: "move"; start: Point; before: Shape; last: Shape }
  | { mode: "move_many"; start: Point; before: Shape[]; last: Shape[] }
  | { mode: "resize"; start: Point; handle: ResizeHandle; before: Shape; last: Shape }
  | { mode: "rotate"; center: Point; startAngle: number; before: Shape; last: Shape }
  | {
      mode: "resize_many";
      start: Point;
      handle: ResizeHandle;
      before: Shape[];
      beforeBounds: Bounds;
      last: Shape[];
    }
  | {
      mode: "rotate_many";
      center: Point;
      startAngle: number;
      before: Shape[];
      last: Shape[];
    };

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

export function moveManyFromPointer(
  current: Extract<Interaction, { mode: "move_many" }>,
  point: Point,
): Shape[] {
  return current.before.map((shape) =>
    moveShape(shape, point.x - current.start.x, point.y - current.start.y),
  );
}

export function boxFromPointer(
  current: Extract<Interaction, { mode: "box_select" }>,
  point: Point,
): Bounds {
  return normalizeBounds(current.start, point);
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

export function resizeManyFromPointer(
  current: Extract<Interaction, { mode: "resize_many" }>,
  point: Point,
): Shape[] {
  const nextBounds = resizeBounds(
    current.beforeBounds,
    current.handle,
    point.x - current.start.x,
    point.y - current.start.y,
  );
  return current.before.map((shape) =>
    scaleShapeToBounds(shape, current.beforeBounds, nextBounds),
  );
}

export function rotateFromPointer(
  current: Extract<Interaction, { mode: "rotate" }>,
  point: Point,
): Shape {
  const angleDelta = angleBetween(current.center, point) - current.startAngle;
  return rotateShapeAround(current.before, current.center, angleDelta);
}

export function rotateManyFromPointer(
  current: Extract<Interaction, { mode: "rotate_many" }>,
  point: Point,
): Shape[] {
  const angleDelta = angleBetween(current.center, point) - current.startAngle;
  return current.before.map((shape) => rotateShapeAround(shape, current.center, angleDelta));
}

export function rotationCenterForBounds(bounds: Bounds): Point {
  return getBoundsCenter(bounds);
}

export function buildBatchHistory(before: Shape[], after: Shape[]): HistoryEntry | null {
  const beforeById = new Map(before.map((shape) => [shape.id, shape]));
  const updates = after
    .map((shape) => {
      const previous = beforeById.get(shape.id);
      if (!previous) {
        return null;
      }
      const patch = getChangedFields(previous, shape);
      if (Object.keys(patch).length === 0) {
        return null;
      }
      return {
        before: previous,
        after: shape,
        patch,
      };
    })
    .filter((item): item is { before: Shape; after: Shape; patch: Partial<Shape> } =>
      Boolean(item),
    );

  if (updates.length === 0) {
    return null;
  }

  return {
    forward: {
      id: makeOperationId(),
      kind: "batch",
      ops: updates.map((item) => ({
        id: makeOperationId(),
        kind: "update_shape",
        shapeId: item.after.id,
        patch: item.patch,
      })),
    },
    inverse: {
      id: makeOperationId(),
      kind: "batch",
      ops: updates.map((item) => ({
        id: makeOperationId(),
        kind: "update_shape",
        shapeId: item.before.id,
        patch: getChangedFields(item.after, item.before),
      })),
    },
  };
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
