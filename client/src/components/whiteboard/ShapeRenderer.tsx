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
  const rotation = shape.rotation ?? 0;
  const shared = {
    onPointerDown: (event: PointerEvent<SVGElement>) => onPointerDown(event, shape),
    onContextMenu: (event: MouseEvent<SVGElement>) => onContextMenu(event, shape),
    onDoubleClick: (event: MouseEvent<SVGElement>) => onDoubleClick(event, shape),
    className: "shape",
  };

  if (shape.type === "rect") {
    const centerX = shape.x + shape.width / 2;
    const centerY = shape.y + shape.height / 2;
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
        transform={`rotate(${rotation} ${centerX} ${centerY})`}
      />
    );
  }

  if (shape.type === "ellipse") {
    const centerX = shape.x + shape.width / 2;
    const centerY = shape.y + shape.height / 2;
    return (
      <ellipse
        key={shape.id}
        {...shared}
        cx={centerX}
        cy={centerY}
        rx={shape.width / 2}
        ry={shape.height / 2}
        fill={shape.fillColor}
        fillOpacity={shape.fillOpacity ?? 1}
        stroke={shape.strokeColor}
        strokeOpacity={shape.strokeOpacity ?? 1}
        strokeWidth={shape.strokeWidth}
        transform={`rotate(${rotation} ${centerX} ${centerY})`}
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

  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;
  return (
    <g key={shape.id} {...shared} transform={`rotate(${rotation} ${centerX} ${centerY})`}>
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
      <foreignObject
        x={shape.x + 12}
        y={shape.y + 8}
        width={Math.max(0, shape.width - 24)}
        height={Math.max(0, shape.height - 16)}
        pointerEvents="none"
      >
        <div
          className="shape-text-content"
          style={{
            color: shape.textColor ?? shape.strokeColor,
            fontSize: shape.fontSize,
            opacity: shape.textOpacity ?? shape.strokeOpacity ?? 1,
          }}
        >
          {shape.text}
        </div>
      </foreignObject>
    </g>
  );
}
