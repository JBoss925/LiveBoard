import type { MouseEvent, PointerEvent } from "react";
import type { Shape } from "../../types";

type ShapeRendererProps = {
  shape: Shape;
  onPointerDown: (event: PointerEvent<SVGElement>, shape: Shape) => void;
  onContextMenu: (event: MouseEvent<SVGElement>, shape: Shape) => void;
  onDoubleClick: (event: MouseEvent<SVGElement>, shape: Shape) => void;
};

export function ShapeRenderer({
  shape,
  onPointerDown,
  onContextMenu,
  onDoubleClick,
}: ShapeRendererProps) {
  const shared = {
    onPointerDown: (event: PointerEvent<SVGElement>) => onPointerDown(event, shape),
    onContextMenu: (event: MouseEvent<SVGElement>) => onContextMenu(event, shape),
    onDoubleClick: (event: MouseEvent<SVGElement>) => onDoubleClick(event, shape),
    className: "shape",
  };

  if (shape.type === "rect") {
    return (
      <rect
        key={shape.id}
        {...shared}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={shape.fillColor}
        fillOpacity={shape.fillOpacity ?? 1}
        stroke={shape.strokeColor}
        strokeOpacity={shape.strokeOpacity ?? 1}
        strokeWidth={shape.strokeWidth}
      />
    );
  }

  if (shape.type === "ellipse") {
    return (
      <ellipse
        key={shape.id}
        {...shared}
        cx={shape.x + shape.width / 2}
        cy={shape.y + shape.height / 2}
        rx={shape.width / 2}
        ry={shape.height / 2}
        fill={shape.fillColor}
        fillOpacity={shape.fillOpacity ?? 1}
        stroke={shape.strokeColor}
        strokeOpacity={shape.strokeOpacity ?? 1}
        strokeWidth={shape.strokeWidth}
      />
    );
  }

  if (shape.type === "line") {
    return (
      <line
        key={shape.id}
        {...shared}
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        stroke={shape.strokeColor}
        strokeOpacity={shape.strokeOpacity ?? 1}
        strokeWidth={shape.strokeWidth}
        strokeLinecap="round"
      />
    );
  }

  return (
    <g key={shape.id} {...shared}>
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={shape.fillColor}
        fillOpacity={shape.fillOpacity ?? 1}
        stroke={shape.strokeColor}
        strokeOpacity={shape.strokeOpacity ?? 1}
        strokeWidth={shape.strokeWidth}
      />
      <text
        x={shape.x + 12}
        y={shape.y + shape.fontSize + 8}
        fill={shape.strokeColor}
        fillOpacity={shape.strokeOpacity ?? 1}
        fontSize={shape.fontSize}
      >
        {shape.text}
      </text>
    </g>
  );
}
