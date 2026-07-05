import type { PointerEvent } from "react";
import type { ResizeHandle, Shape } from "../types";

export type Point = { x: number; y: number };
export type Bounds = { x: number; y: number; width: number; height: number };
export type Corners = {
  nw: Point;
  ne: Point;
  se: Point;
  sw: Point;
};

export function getSvgPoint(
  event: PointerEvent<SVGElement>,
  svgElement: SVGSVGElement,
): Point {
  const point = svgElement.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svgElement.getScreenCTM()?.inverse());
  return { x: transformed.x, y: transformed.y };
}

export function getShapeBounds(shape: Shape): Bounds {
  if (shape.type === "line") {
    const x = Math.min(shape.x1, shape.x2);
    const y = Math.min(shape.y1, shape.y2);
    return {
      x,
      y,
      width: Math.abs(shape.x2 - shape.x1),
      height: Math.abs(shape.y2 - shape.y1),
    };
  }
  return {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  };
}

export function normalizeBounds(start: Point, end: Point): Bounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function getCombinedBounds(shapes: Shape[]): Bounds | null {
  if (shapes.length === 0) {
    return null;
  }

  const bounds = shapes.map(getRenderedShapeBounds);
  const minX = Math.min(...bounds.map((item) => item.x));
  const minY = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.width));
  const maxY = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function getBoundsCorners(bounds: Bounds): Corners {
  return {
    nw: { x: bounds.x, y: bounds.y },
    ne: { x: bounds.x + bounds.width, y: bounds.y },
    se: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    sw: { x: bounds.x, y: bounds.y + bounds.height },
  };
}

export function getRenderedShapeCorners(shape: Shape): Corners {
  const bounds = getShapeBounds(shape);
  if (shape.type === "line") {
    return getBoundsCorners(bounds);
  }

  const center = getBoundsCenter(bounds);
  const corners = getBoundsCorners(bounds);
  const rotation = shape.rotation ?? 0;
  return {
    nw: rotatePoint(corners.nw, center, rotation),
    ne: rotatePoint(corners.ne, center, rotation),
    se: rotatePoint(corners.se, center, rotation),
    sw: rotatePoint(corners.sw, center, rotation),
  };
}

export function getRenderedShapeBounds(shape: Shape): Bounds {
  const corners = getRenderedShapeCorners(shape);
  const points = Object.values(corners);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function offsetPointFromCenter(point: Point, center: Point, distance: number): Point {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return { x: point.x, y: point.y - distance };
  }
  return {
    x: point.x + (dx / length) * distance,
    y: point.y + (dy / length) * distance,
  };
}

export function getBoundsCenter(bounds: Bounds): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export function getShapeCenter(shape: Shape): Point {
  return getBoundsCenter(getShapeBounds(shape));
}

export function angleBetween(center: Point, point: Point): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

export function hitTestShape(shape: Shape, point: Point): boolean {
  if (shape.type === "line") {
    return distanceToSegment(point, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }) <= 8;
  }
  const bounds = getShapeBounds(shape);
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function moveShape(shape: Shape, dx: number, dy: number): Shape {
  if (shape.type === "line") {
    return {
      ...shape,
      x1: shape.x1 + dx,
      y1: shape.y1 + dy,
      x2: shape.x2 + dx,
      y2: shape.y2 + dy,
      updatedAt: Date.now(),
    };
  }
  return { ...shape, x: shape.x + dx, y: shape.y + dy, updatedAt: Date.now() };
}

export function rotateShapeAround(
  shape: Shape,
  center: Point,
  angleDelta: number,
): Shape {
  if (shape.type === "line") {
    const start = rotatePoint({ x: shape.x1, y: shape.y1 }, center, angleDelta);
    const end = rotatePoint({ x: shape.x2, y: shape.y2 }, center, angleDelta);
    return {
      ...shape,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      updatedAt: Date.now(),
    };
  }

  const shapeCenter = rotatePoint(getShapeCenter(shape), center, angleDelta);
  return {
    ...shape,
    x: shapeCenter.x - shape.width / 2,
    y: shapeCenter.y - shape.height / 2,
    rotation: normalizeRotation((shape.rotation ?? 0) + angleDelta),
    updatedAt: Date.now(),
  } as Shape;
}

export function resizeShape(
  shape: Shape,
  handle: ResizeHandle,
  startShape: Shape,
  dx: number,
  dy: number,
): Shape {
  if (startShape.type === "line") {
    if (handle === "start") {
      return { ...startShape, x1: startShape.x1 + dx, y1: startShape.y1 + dy, updatedAt: Date.now() };
    }
    return { ...startShape, x2: startShape.x2 + dx, y2: startShape.y2 + dy, updatedAt: Date.now() };
  }
  if (shape.type === "line") {
    return shape;
  }

  let x = startShape.x;
  let y = startShape.y;
  let width = startShape.width;
  let height = startShape.height;

  if (handle.includes("w")) {
    x = startShape.x + dx;
    width = startShape.width - dx;
  }
  if (handle.includes("e")) {
    width = startShape.width + dx;
  }
  if (handle.includes("n")) {
    y = startShape.y + dy;
    height = startShape.height - dy;
  }
  if (handle.includes("s")) {
    height = startShape.height + dy;
  }

  if (width < 0) {
    x += width;
    width = Math.abs(width);
  }
  if (height < 0) {
    y += height;
    height = Math.abs(height);
  }

  return { ...startShape, x, y, width, height, updatedAt: Date.now() } as Shape;
}

export function resizeBounds(
  bounds: Bounds,
  handle: ResizeHandle,
  dx: number,
  dy: number,
): Bounds {
  let x = bounds.x;
  let y = bounds.y;
  let width = bounds.width;
  let height = bounds.height;

  if (handle.includes("w")) {
    x = bounds.x + dx;
    width = bounds.width - dx;
  }
  if (handle.includes("e")) {
    width = bounds.width + dx;
  }
  if (handle.includes("n")) {
    y = bounds.y + dy;
    height = bounds.height - dy;
  }
  if (handle.includes("s")) {
    height = bounds.height + dy;
  }

  if (width < 1) {
    x = bounds.x + bounds.width - 1;
    width = 1;
  }
  if (height < 1) {
    y = bounds.y + bounds.height - 1;
    height = 1;
  }

  return { x, y, width, height };
}

export function scaleShapeToBounds(
  shape: Shape,
  from: Bounds,
  to: Bounds,
): Shape {
  const scaleX = from.width === 0 ? 1 : to.width / from.width;
  const scaleY = from.height === 0 ? 1 : to.height / from.height;
  const projectX = (x: number) => to.x + (x - from.x) * scaleX;
  const projectY = (y: number) => to.y + (y - from.y) * scaleY;

  if (shape.type === "line") {
    return {
      ...shape,
      x1: projectX(shape.x1),
      y1: projectY(shape.y1),
      x2: projectX(shape.x2),
      y2: projectY(shape.y2),
      updatedAt: Date.now(),
    };
  }

  return {
    ...shape,
    x: projectX(shape.x),
    y: projectY(shape.y),
    width: Math.max(1, shape.width * scaleX),
    height: Math.max(1, shape.height * scaleY),
    updatedAt: Date.now(),
  } as Shape;
}

export function getChangedFields(before: Shape, after: Shape): Partial<Shape> {
  const patch: Partial<Shape> = {};
  for (const key of Object.keys(after) as Array<keyof Shape>) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      (patch as Record<string, unknown>)[key] = after[key];
    }
  }
  return patch;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function rotatePoint(point: Point, center: Point, angleDegrees: number): Point {
  const angle = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
