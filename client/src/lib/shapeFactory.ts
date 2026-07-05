import type { Point } from "./geometry";
import type { Shape, ShapeType } from "../types";

type ShapeDefaults = {
  strokeColor: string;
  fillColor: string;
  strokeOpacity: number;
  fillOpacity: number;
  strokeWidth: number;
  createdBy: string;
};

export function createBaseShape(
  type: ShapeType,
  point: Point,
  defaults: ShapeDefaults,
): Shape {
  const base = {
    id: crypto.randomUUID(),
    strokeColor: defaults.strokeColor,
    fillColor: defaults.fillColor,
    strokeOpacity: defaults.strokeOpacity,
    fillOpacity: defaults.fillOpacity,
    strokeWidth: defaults.strokeWidth,
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
      textColor: defaults.strokeColor,
      textOpacity: defaults.strokeOpacity,
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
