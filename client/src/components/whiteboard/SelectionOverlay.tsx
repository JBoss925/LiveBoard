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
  onHandlePointerDown,
  onSelectionContextMenu,
  onSelectionPointerDown,
}: SelectionOverlayProps) {
  const shape = shapes[0];
  if (!shape) {
    return null;
  }

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
      y: bounds.y - 28,
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
        <circle
          className="selection-rotation-handle"
          cx={rotateHandle.x}
          cy={rotateHandle.y}
          r="7"
          onPointerDown={(event) => onHandlePointerDown(event, "rotate", shape)}
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
          <circle
            key={handle}
            cx={x}
            cy={y}
            r="7"
            onPointerDown={(event) => onHandlePointerDown(event, handle, shape)}
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
          y2={centerY - 28}
        />
        <circle
          className="selection-rotation-handle"
          cx={centerX}
          cy={centerY - 28}
          r="7"
          onPointerDown={(event) => onHandlePointerDown(event, "rotate", shape)}
        />
        <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
        {[
          ["start", shape.x1, shape.y1],
          ["end", shape.x2, shape.y2],
        ].map(([handle, x, y]) => (
          <circle
            key={handle}
            cx={Number(x)}
            cy={Number(y)}
            r="7"
            onPointerDown={(event) =>
              onHandlePointerDown(event, handle as ResizeHandle, shape)
            }
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
  const rotateHandle = offsetPointFromCenter(topCenter, center, 28);

  return (
    <g className="selection">
      <line
        className="selection-rotation-stem"
        x1={topCenter.x}
        y1={topCenter.y}
        x2={rotateHandle.x}
        y2={rotateHandle.y}
      />
      <circle
        className="selection-rotation-handle"
        cx={rotateHandle.x}
        cy={rotateHandle.y}
        r="7"
        onPointerDown={(event) => onHandlePointerDown(event, "rotate", shape)}
      />
      <SelectionPolygon corners={corners} />
      {handles.map(([handle, point]) => (
        <circle
          key={handle}
          cx={point.x}
          cy={point.y}
          r="7"
          onPointerDown={(event) => onHandlePointerDown(event, handle, shape)}
        />
      ))}
    </g>
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
