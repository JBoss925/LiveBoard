import type { CanvasOperation, CanvasState, Shape } from "../types";

export function makeOperationId(): string {
  return crypto.randomUUID();
}

export function applyOperation(
  state: CanvasState,
  op: CanvasOperation,
): CanvasState {
  if (op.kind === "create_shape") {
    if (state.shapes.some((shape) => shape.id === op.shape.id)) {
      return state;
    }
    return { shapes: [...state.shapes, op.shape] };
  }
  if (op.kind === "delete_shape") {
    return { shapes: state.shapes.filter((shape) => shape.id !== op.shapeId) };
  }
  return {
    shapes: state.shapes.map((shape) =>
      shape.id === op.shapeId ? ({ ...shape, ...op.patch } as Shape) : shape,
    ),
  };
}

export function findShape(state: CanvasState, shapeId: string | null): Shape | null {
  if (!shapeId) {
    return null;
  }
  return state.shapes.find((shape) => shape.id === shapeId) ?? null;
}
