import { KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import { useCanvasHistory } from "../hooks/useCanvasHistory";
import { useCanvasSocket } from "../hooks/useCanvasSocket";
import { useLiveShapeUpdates } from "../hooks/useLiveShapeUpdates";
import { useWhiteboardInteractions } from "../hooks/useWhiteboardInteractions";
import { getChangedFields } from "../lib/geometry";
import { findShape, makeOperationId } from "../lib/operations";
import type { Shape, TextShape, Tool, User } from "../types";
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

type TextEditState = {
  shapeId: string;
  value: string;
};

export function Whiteboard({ canvasId, token, user, onBack }: WhiteboardProps) {
  const socket = useCanvasSocket(canvasId, token);
  const history = useCanvasHistory({ sendOperation: socket.sendOperation });
  const liveUpdates = useLiveShapeUpdates({
    sendPreviewOperation: socket.sendPreviewOperation,
  });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [canvasName, setCanvasName] = useState("Canvas");
  const [canvasOwnerId, setCanvasOwnerId] = useState<string | null>(null);
  const [canvasLoading, setCanvasLoading] = useState(true);
  const [tool, setTool] = useState<Tool>("select");
  const [strokeColor, setStrokeColor] = useState("#1d3557");
  const [fillColor, setFillColor] = useState("#a8dadc");
  const [textColor, setTextColor] = useState("#1d3557");
  const [strokeOpacity, setStrokeOpacity] = useState(1);
  const [fillOpacity, setFillOpacity] = useState(1);
  const [textOpacity, setTextOpacity] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const committedTextEditId = useRef<string | null>(null);

  const selectedShape = useMemo(
    () => findShape(socket.state, selectedId),
    [socket.state, selectedId],
  );

  const interactions = useWhiteboardInteractions({
    fillColor,
    fillOpacity,
    history,
    liveUpdates,
    selectedId,
    selectedShape,
    setLocalState: socket.setLocalState,
    setSelectedId,
    setTool,
    strokeColor,
    strokeOpacity,
    svgRef,
    tool,
    userId: user.id,
    sendCursor: socket.sendCursor,
    sendOperation: socket.sendOperation,
    onStartTextEdit: startTextEdit,
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
    if (!selectedShape) {
      return;
    }
    setStrokeColor(selectedShape.strokeColor);
    setStrokeOpacity(selectedShape.strokeOpacity ?? 1);
    if (selectedShape.type !== "line") {
      setFillColor(selectedShape.fillColor);
      setFillOpacity(selectedShape.fillOpacity ?? 1);
    }
    if (selectedShape.type === "text") {
      setTextColor(selectedShape.textColor ?? selectedShape.strokeColor);
      setTextOpacity(selectedShape.textOpacity ?? selectedShape.strokeOpacity ?? 1);
    }
  }, [selectedShape]);

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

  function startTextEdit(shape: Shape) {
    if (shape.type !== "text") {
      return;
    }
    committedTextEditId.current = null;
    setSelectedId(shape.id);
    setTextEdit({ shapeId: shape.id, value: shape.text });
  }

  function commitTextEdit(edit = textEdit) {
    if (!edit) {
      return;
    }
    if (committedTextEditId.current === edit.shapeId) {
      return;
    }
    committedTextEditId.current = edit.shapeId;
    const shape = findShape(socket.state, edit.shapeId);
    setTextEdit(null);
    if (!shape || shape.type !== "text" || shape.text === edit.value) {
      return;
    }

    const after = { ...shape, text: edit.value, updatedAt: Date.now() };
    history.sendWithHistory({
      forward: {
        id: makeOperationId(),
        kind: "update_shape",
        shapeId: shape.id,
        patch: getChangedFields(shape, after),
      },
      inverse: {
        id: makeOperationId(),
        kind: "update_shape",
        shapeId: shape.id,
        patch: getChangedFields(after, shape),
      },
    });
  }

  return (
    <main className="board-shell">
      <BoardHeader
        activeUsers={socket.activeUsers}
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
          textColor={textColor}
          strokeOpacity={strokeOpacity}
          fillOpacity={fillOpacity}
          textOpacity={textOpacity}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          hasSelection={Boolean(selectedShape)}
          showTextControls={selectedShape?.type === "text"}
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
          onTextColorChange={(color) => {
            setTextColor(color);
            if (selectedShape?.type === "text") {
              interactions.updateSelectedColor({ textColor: color } as Partial<Shape>);
            }
          }}
          onStrokeOpacityChange={(opacity) => {
            setStrokeOpacity(opacity);
          }}
          onFillOpacityChange={(opacity) => {
            setFillOpacity(opacity);
          }}
          onTextOpacityChange={(opacity) => {
            setTextOpacity(opacity);
          }}
          onStrokeOpacityCommit={(opacity) => {
            interactions.updateSelectedColor({ strokeOpacity: opacity } as Partial<Shape>);
          }}
          onFillOpacityCommit={(opacity) => {
            if (selectedShape?.type !== "line") {
              interactions.updateSelectedColor({ fillOpacity: opacity } as Partial<Shape>);
            }
          }}
          onTextOpacityCommit={(opacity) => {
            if (selectedShape?.type === "text") {
              interactions.updateSelectedColor({ textOpacity: opacity } as Partial<Shape>);
            }
          }}
          onDelete={interactions.deleteSelectedShape}
          onUndo={history.undo}
          onRedo={history.redo}
        />

        <section className="canvas-stage">
          <div
            className="canvas-frame"
            onPointerDownCapture={(event) => {
              if (textEdit && !(event.target instanceof HTMLTextAreaElement)) {
                commitTextEdit(textEdit);
              }
            }}
          >
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
              textEditor={
                textEdit && selectedShape?.type === "text" ? (
                  <InlineTextEditor
                    shape={selectedShape}
                    value={textEdit.value}
                    onChange={(value) =>
                      setTextEdit((current) =>
                        current ? { ...current, value } : current,
                      )
                    }
                    onCommit={(value) => commitTextEdit({ ...textEdit, value })}
                  />
                ) : null
              }
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
                onDelete={() => {
                  interactions.deleteSelectedShape();
                  setContextMenu(null);
                }}
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

type InlineTextEditorProps = {
  shape: TextShape;
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
};

function InlineTextEditor({
  shape,
  value,
  onChange,
  onCommit,
}: InlineTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, [shape.id]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCommit(event.currentTarget.value);
    }
    if ((event.key === "Enter" && (event.metaKey || event.ctrlKey)) || event.key === "Tab") {
      event.preventDefault();
      onCommit(event.currentTarget.value);
    }
  }

  return (
    <foreignObject
      x={shape.x + 12}
      y={shape.y + 8}
      width={Math.max(80, shape.width - 24)}
      height={Math.max(shape.fontSize + 16, shape.height - 16)}
    >
      <textarea
        ref={textareaRef}
        className="inline-text-editor"
        style={{
          color: shape.textColor ?? shape.strokeColor,
          opacity: shape.textOpacity ?? shape.strokeOpacity ?? 1,
          fontSize: shape.fontSize,
        }}
        value={value}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </foreignObject>
  );
}

type ShapeContextMenuProps = {
  x: number;
  y: number;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  onDelete: () => void;
};

function ShapeContextMenu({
  x,
  y,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onDelete,
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
      <button className="danger" onClick={onDelete} type="button">
        Delete
      </button>
    </div>
  );
}
