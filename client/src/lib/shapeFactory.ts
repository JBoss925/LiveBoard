import type { Point } from "./geometry";
import type { Shape, Tool } from "../types";

type ShapeDefaults = {
  strokeColor: string;
  fillColor: string;
  createdBy: string;
};

export function createBaseShape(
  type: Exclude<Tool, "select">,
  point: Point,
  defaults: ShapeDefaults,
): Shape {
  const base = {
    id: crypto.randomUUID(),
    strokeColor: defaults.strokeColor,
    fillColor: defaults.fillColor,
    strokeWidth: 2,
    createdBy: defaults.createdBy,
    updatedAt: Date.now(),
  };

  if (type === "line") {
    return {
      ...base,
      type: "line",
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
    };
  }

  if (type === "text") {
    return {
      ...base,
      type: "text",
      x: point.x,
      y: point.y,
      width: 220,
      height: 56,
      text: "Text",
      fontSize: 20,
    };
  }

  return {
    ...base,
    type,
    x: point.x,
    y: point.y,
    width: 1,
    height: 1,
  };
}
