import type { MouseEvent, PointerEvent, ReactNode, WheelEvent } from "react";
import {
  type CanvasState,
  type RemoteCursor,
  type ResizeHandle,
  type Shape,
} from "../../types";
import type { Bounds } from "../../lib/geometry";
import { RemoteCursorLayer } from "./RemoteCursorLayer";
import { SelectionOverlay } from "./SelectionOverlay";
import { ShapeRenderer } from "./ShapeRenderer";

type CanvasSvgProps = {
  canvasState: CanvasState;
  remoteCursors: RemoteCursor[];
  selectedShapes: Shape[];
  selectionBox: Bounds | null;
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
  onSelectionPointerDown: (event: PointerEvent<SVGElement>) => void;
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
  selectedShapes,
  selectionBox,
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
  onSelectionPointerDown,
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
      {selectedShapes.length > 0 ? (
        <SelectionOverlay
          shapes={selectedShapes}
          onHandlePointerDown={onHandlePointerDown}
          onSelectionPointerDown={onSelectionPointerDown}
        />
      ) : null}
      {selectionBox ? (
        <rect
          className="selection-box"
          x={selectionBox.x}
          y={selectionBox.y}
          width={selectionBox.width}
          height={selectionBox.height}
        />
      ) : null}
      {textEditor}
      <RemoteCursorLayer cursors={remoteCursors} zoom={zoom} />
    </svg>
  );
}
