import type { MouseEvent, PointerEvent, ReactNode, WheelEvent } from "react";
import {
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
  viewBox: string;
  zoom: number;
  onCanvasPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  onWheel: (event: WheelEvent<SVGSVGElement>) => void;
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
  viewBox,
  zoom,
  onCanvasPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  onShapePointerDown,
  onShapeContextMenu,
  onHandlePointerDown,
  onTextDoubleClick,
}: CanvasSvgProps) {
  return (
    <svg
      ref={svgRef}
      className="whiteboard-canvas"
      viewBox={viewBox}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    >
      <rect
        className="canvas-background"
        data-canvas-background="true"
        x="-1000000"
        y="-1000000"
        width="2000000"
        height="2000000"
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
      <RemoteCursorLayer cursors={remoteCursors} zoom={zoom} />
    </svg>
  );
}
