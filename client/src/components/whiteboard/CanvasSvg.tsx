import type { MouseEvent, PointerEvent, ReactNode } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type CanvasState,
  type RemoteCursor,
  type ResizeHandle,
  type Shape,
} from "../../types";
import { RemoteCursorLayer } from "./RemoteCursorLayer";
import { SelectionOverlay } from "./SelectionOverlay";
import { ShapeRenderer } from "./ShapeRenderer";

type CanvasSvgProps = {
  canvasState: CanvasState;
  remoteCursors: RemoteCursor[];
  selectedShape: Shape | null;
  textEditor: ReactNode;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onCanvasPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  onShapePointerDown: (event: PointerEvent<SVGElement>, shape: Shape) => void;
  onShapeContextMenu: (event: MouseEvent<SVGElement>, shape: Shape) => void;
  onHandlePointerDown: (
    event: PointerEvent<SVGElement>,
    handle: ResizeHandle,
    shape: Shape,
  ) => void;
  onTextDoubleClick: (event: MouseEvent<SVGElement>, shape: Shape) => void;
};

export function CanvasSvg({
  canvasState,
  remoteCursors,
  selectedShape,
  textEditor,
  svgRef,
  onCanvasPointerDown,
  onPointerMove,
  onPointerUp,
  onShapePointerDown,
  onShapeContextMenu,
  onHandlePointerDown,
  onTextDoubleClick,
}: CanvasSvgProps) {
  return (
    <svg
      ref={svgRef}
      className="whiteboard-canvas"
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <rect
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        fill={canvasState.backgroundColor ?? "#ffffff"}
      />
      {canvasState.shapes.map((shape) => (
        <ShapeRenderer
          key={shape.id}
          shape={shape}
          onPointerDown={onShapePointerDown}
          onContextMenu={onShapeContextMenu}
          onDoubleClick={onTextDoubleClick}
        />
      ))}
      {selectedShape ? (
        <SelectionOverlay
          shape={selectedShape}
          onHandlePointerDown={onHandlePointerDown}
        />
      ) : null}
      {textEditor}
      <RemoteCursorLayer cursors={remoteCursors} />
    </svg>
  );
}
