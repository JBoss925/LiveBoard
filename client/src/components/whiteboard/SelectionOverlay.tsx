import type { PointerEvent } from "react";
import { getShapeBounds } from "../../lib/geometry";
import type { ResizeHandle, Shape } from "../../types";

type SelectionOverlayProps = {
  shape: Shape;
  onHandlePointerDown: (
    event: PointerEvent<SVGElement>,
    handle: ResizeHandle,
    shape: Shape,
  ) => void;
};

export function SelectionOverlay({
  shape,
  onHandlePointerDown,
}: SelectionOverlayProps) {
  if (shape.type === "line") {
    return (
      <g className="selection">
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
  const handles: Array<[ResizeHandle, number, number]> = [
    ["nw", bounds.x, bounds.y],
    ["ne", bounds.x + bounds.width, bounds.y],
    ["sw", bounds.x, bounds.y + bounds.height],
    ["se", bounds.x + bounds.width, bounds.y + bounds.height],
  ];

  return (
    <g className="selection">
      <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} />
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
