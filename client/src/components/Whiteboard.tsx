import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import { useCanvasHistory } from "../hooks/useCanvasHistory";
import { useCanvasSocket } from "../hooks/useCanvasSocket";
import { useLiveShapeUpdates } from "../hooks/useLiveShapeUpdates";
import { useWhiteboardInteractions } from "../hooks/useWhiteboardInteractions";
import { findShape, makeOperationId } from "../lib/operations";
import type { Shape, Tool, User } from "../types";
import { ShareModal } from "./ShareModal";
import { Toolbar } from "./Toolbar";
import { BoardHeader } from "./whiteboard/BoardHeader";
import { CanvasSvg } from "./whiteboard/CanvasSvg";

type WhiteboardProps = {
  canvasId: string;
  token: string | null;
  user: User;
  onBack: () => void;
};

type ContextMenuState = {
  shapeId: string;
  x: number;
  y: number;
};

export function Whiteboard({ canvasId, token, user, onBack }: WhiteboardProps) {
  const socket = useCanvasSocket(canvasId, token);
  const history = useCanvasHistory({ sendOperation: socket.sendOperation });
  const liveUpdates = useLiveShapeUpdates({ sendOperation: socket.sendOperation });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [canvasName, setCanvasName] = useState("Canvas");
  const [canvasOwnerId, setCanvasOwnerId] = useState<string | null>(null);
  const [canvasLoading, setCanvasLoading] = useState(true);
  const [tool, setTool] = useState<Tool>("select");
  const [strokeColor, setStrokeColor] = useState("#1d3557");
  const [fillColor, setFillColor] = useState("#a8dadc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const selectedShape = useMemo(
    () => findShape(socket.state, selectedId),
    [socket.state, selectedId],
  );

  const interactions = useWhiteboardInteractions({
    fillColor,
    history,
    liveUpdates,
    selectedId,
    selectedShape,
    setLocalState: socket.setLocalState,
    setSelectedId,
    setTool,
    strokeColor,
    svgRef,
    tool,
    userId: user.id,
    sendCursor: socket.sendCursor,
    sendOperation: socket.sendOperation,
  });

  useEffect(() => {
    setCanvasLoading(true);
    api
      .getCanvas(canvasId)
      .then((canvas) => {
        setCanvasName(canvas.name);
        setCanvasOwnerId(canvas.ownerId);
      })
      .catch(() => {
        setCanvasName("Canvas");
        setCanvasOwnerId(null);
      })
      .finally(() => setCanvasLoading(false));
  }, [canvasId]);

  useEffect(() => {
    if (selectedId && !selectedShape) {
      setSelectedId(null);
    }
  }, [selectedId, selectedShape]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("blur", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("blur", closeMenu);
    };
  }, [contextMenu]);

  function handleShapeContextMenu(event: MouseEvent<SVGElement>, shape: Shape) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(shape.id);
    setContextMenu({ shapeId: shape.id, x: event.clientX, y: event.clientY });
  }

  function reorderShape(shapeId: string, direction: "front" | "forward" | "backward" | "back") {
    const currentIndex = socket.state.shapes.findIndex((shape) => shape.id === shapeId);
    if (currentIndex === -1) {
      return;
    }

    const lastIndex = socket.state.shapes.length - 1;
    const nextIndexByDirection = {
      front: lastIndex,
      forward: Math.min(currentIndex + 1, lastIndex),
      backward: Math.max(currentIndex - 1, 0),
      back: 0,
    };
    const nextIndex = nextIndexByDirection[direction];
    if (nextIndex === currentIndex) {
      setContextMenu(null);
      return;
    }

    history.sendWithHistory({
      forward: {
        id: makeOperationId(),
        kind: "reorder_shape",
        shapeId,
        toIndex: nextIndex,
      },
      inverse: {
        id: makeOperationId(),
        kind: "reorder_shape",
        shapeId,
        toIndex: currentIndex,
      },
    });
    setContextMenu(null);
  }

  return (
    <main className="board-shell">
      <BoardHeader
        canvasName={canvasName}
        connected={socket.connected}
        loading={canvasLoading}
        revision={socket.revision}
        user={user}
        onBack={onBack}
        onOpenShare={() => setShareOpen(true)}
      />

      <div className="board-layout">
        <Toolbar
          tool={tool}
          strokeColor={strokeColor}
          fillColor={fillColor}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          hasSelection={Boolean(selectedShape)}
          onToolChange={setTool}
          onStrokeColorChange={(color) => {
            setStrokeColor(color);
            interactions.updateSelectedColor({ strokeColor: color } as Partial<Shape>);
          }}
          onFillColorChange={(color) => {
            setFillColor(color);
            if (selectedShape?.type !== "line") {
              interactions.updateSelectedColor({ fillColor: color } as Partial<Shape>);
            }
          }}
          onDelete={interactions.deleteSelectedShape}
          onUndo={history.undo}
          onRedo={history.redo}
        />

        <section className="canvas-stage">
          <div className="canvas-frame">
            {!socket.connected ? (
              <div className="canvas-loading-banner" role="status">
                {socket.accessMessage ?? "Syncing live canvas..."}
              </div>
            ) : null}
            {socket.accessMessage ? (
              <div className="canvas-access-overlay" role="alert">
                <div>
                  <p className="eyebrow">Access removed</p>
                  <h2>You no longer have access to this canvas.</h2>
                  <p>{socket.accessMessage}</p>
                  <button onClick={onBack} type="button">
                    Back to canvases
                  </button>
                </div>
              </div>
            ) : null}
            <CanvasSvg
              canvasState={socket.state}
              remoteCursors={socket.remoteCursors}
              selectedShape={selectedShape}
              svgRef={svgRef}
              onCanvasPointerDown={interactions.handleCanvasPointerDown}
              onPointerMove={interactions.handlePointerMove}
              onPointerUp={interactions.handlePointerUp}
              onShapePointerDown={interactions.handleShapePointerDown}
              onShapeContextMenu={handleShapeContextMenu}
              onHandlePointerDown={interactions.handleHandlePointerDown}
              onTextDoubleClick={interactions.handleTextDoubleClick}
            />
            {contextMenu ? (
              <ShapeContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                onBringToFront={() => reorderShape(contextMenu.shapeId, "front")}
                onBringForward={() => reorderShape(contextMenu.shapeId, "forward")}
                onSendBackward={() => reorderShape(contextMenu.shapeId, "backward")}
                onSendToBack={() => reorderShape(contextMenu.shapeId, "back")}
              />
            ) : null}
          </div>
        </section>
      </div>
      {shareOpen ? (
        <ShareModal
          canvasId={canvasId}
          currentUserId={user.id}
          ownerId={canvasOwnerId}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      <span hidden>{history.version}</span>
    </main>
  );
}

type ShapeContextMenuProps = {
  x: number;
  y: number;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
};

function ShapeContextMenu({
  x,
  y,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
}: ShapeContextMenuProps) {
  return (
    <div
      className="shape-context-menu"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button onClick={onBringToFront} type="button">
        Bring to front
      </button>
      <button onClick={onBringForward} type="button">
        Bring forward
      </button>
      <button onClick={onSendBackward} type="button">
        Send backward
      </button>
      <button onClick={onSendToBack} type="button">
        Send to back
      </button>
    </div>
  );
}
