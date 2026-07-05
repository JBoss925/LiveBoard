import type { MouseEvent, PointerEvent } from "react";
import {
  getBoundsCenter,
  getCombinedBounds,
  getRenderedShapeCorners,
  getShapeBounds,
  offsetPointFromCenter,
  type Corners,
  type Point,
} from "../../lib/geometry";
import { isGroupedShape } from "../../lib/groups";
import type { ResizeHandle, Shape, TransformHandle } from "../../types";

type SelectionOverlayProps = {
  shapes: Shape[];
  zoom: number;
  onHandlePointerDown: (
    event: PointerEvent<SVGElement>,
    handle: TransformHandle,
    shape: Shape,
  ) => void;
  onSelectionPointerDown: (event: PointerEvent<SVGElement>) => void;
  onSelectionContextMenu: (event: MouseEvent<SVGElement>) => void;
};

export function SelectionOverlay({
  shapes,
  zoom,
  onHandlePointerDown,
  onSelectionContextMenu,
  onSelectionPointerDown,
}: SelectionOverlayProps) {
  const shape = shapes[0];
  if (!shape) {
    return null;
  }

  const scale = 1 / Math.max(zoom, 0.1);
  const visibleHandleRadius = 8 * scale;
  const hitHandleRadius = 16 * scale;
  const rotationHandleOffset = 34 * scale;

  const isSingleUnlockedShape = shapes.length === 1 && !isGroupedShape(shape);
  if (!isSingleUnlockedShape) {
    const bounds = getCombinedBounds(shapes);
    if (!bounds) {
      return null;
    }
    const handles: Array<[ResizeHandle, number, number]> = [
      ["nw", bounds.x, bounds.y],
      ["ne", bounds.x + bounds.width, bounds.y],
      ["sw", bounds.x, bounds.y + bounds.height],
      ["se", bounds.x + bounds.width, bounds.y + bounds.height],
    ];
    const rotateHandle = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y - rotationHandleOffset,
    };

    return (
      <g className="selection selection-combined">
        <line
          className="selection-rotation-stem"
          x1={bounds.x + bounds.width / 2}
          y1={bounds.y}
          x2={rotateHandle.x}
          y2={rotateHandle.y}
        />
        <HandleControl
          className="selection-rotation-handle"
          handle="rotate"
          point={rotateHandle}
          shape={shape}
          visibleRadius={visibleHandleRadius}
          hitRadius={hitHandleRadius}
          onHandlePointerDown={onHandlePointerDown}
        />
        <rect
          className="selection-combined-target"
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          onContextMenu={onSelectionContextMenu}
          onPointerDown={onSelectionPointerDown}
        />
        {handles.map(([handle, x, y]) => (
          <HandleControl
            key={handle}
            handle={handle}
            point={{ x, y }}
            shape={shape}
            visibleRadius={visibleHandleRadius}
            hitRadius={hitHandleRadius}
            onHandlePointerDown={onHandlePointerDown}
          />
        ))}
      </g>
    );
  }

  if (shape.type === "line") {
    const centerX = (shape.x1 + shape.x2) / 2;
    const centerY = (shape.y1 + shape.y2) / 2;
    return (
      <g className="selection">
        <line
          className="selection-rotation-stem"
          x1={centerX}
          y1={centerY}
          x2={centerX}
          y2={centerY - rotationHandleOffset}
        />
        <HandleControl
          className="selection-rotation-handle"
          handle="rotate"
          point={{ x: centerX, y: centerY - rotationHandleOffset }}
          shape={shape}
          visibleRadius={visibleHandleRadius}
          hitRadius={hitHandleRadius}
          onHandlePointerDown={onHandlePointerDown}
        />
        <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
        {[
          ["start", shape.x1, shape.y1],
          ["end", shape.x2, shape.y2],
        ].map(([handle, x, y]) => (
          <HandleControl
            key={handle}
            handle={handle as ResizeHandle}
            point={{ x: Number(x), y: Number(y) }}
            shape={shape}
            visibleRadius={visibleHandleRadius}
            hitRadius={hitHandleRadius}
            onHandlePointerDown={onHandlePointerDown}
          />
        ))}
      </g>
    );
  }

  const bounds = getShapeBounds(shape);
  const corners = getRenderedShapeCorners(shape);
  const center = getBoundsCenter(bounds);
  const handles: Array<[ResizeHandle, Point]> = [
    ["nw", corners.nw],
    ["ne", corners.ne],
    ["sw", corners.sw],
    ["se", corners.se],
  ];
  const topCenter = midpoint(corners.nw, corners.ne);
  const rotateHandle = offsetPointFromCenter(topCenter, center, rotationHandleOffset);

  return (
    <g className="selection">
      <line
        className="selection-rotation-stem"
        x1={topCenter.x}
        y1={topCenter.y}
        x2={rotateHandle.x}
        y2={rotateHandle.y}
      />
      <HandleControl
        className="selection-rotation-handle"
        handle="rotate"
        point={rotateHandle}
        shape={shape}
        visibleRadius={visibleHandleRadius}
        hitRadius={hitHandleRadius}
        onHandlePointerDown={onHandlePointerDown}
      />
      <SelectionPolygon corners={corners} />
      {handles.map(([handle, point]) => (
        <HandleControl
          key={handle}
          handle={handle}
          point={point}
          shape={shape}
          visibleRadius={visibleHandleRadius}
          hitRadius={hitHandleRadius}
          onHandlePointerDown={onHandlePointerDown}
        />
      ))}
    </g>
  );
}

function HandleControl({
  className = "",
  handle,
  hitRadius,
  point,
  shape,
  visibleRadius,
  onHandlePointerDown,
}: {
  className?: string;
  handle: TransformHandle;
  hitRadius: number;
  point: Point;
  shape: Shape;
  visibleRadius: number;
  onHandlePointerDown: (
    event: PointerEvent<SVGElement>,
    handle: TransformHandle,
    shape: Shape,
  ) => void;
}) {
  return (
    <>
      <circle
        className={`selection-handle-hit-target ${className}`}
        cx={point.x}
        cy={point.y}
        r={hitRadius}
        onPointerDown={(event) => onHandlePointerDown(event, handle, shape)}
      />
      <circle
        className={`selection-handle ${className}`}
        cx={point.x}
        cy={point.y}
        r={visibleRadius}
        onPointerDown={(event) => onHandlePointerDown(event, handle, shape)}
      />
    </>
  );
}

function SelectionPolygon({ corners }: { corners: Corners }) {
  return (
    <polygon
      points={[
        `${corners.nw.x},${corners.nw.y}`,
        `${corners.ne.x},${corners.ne.y}`,
        `${corners.se.x},${corners.se.y}`,
        `${corners.sw.x},${corners.sw.y}`,
      ].join(" ")}
    />
  );
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}
