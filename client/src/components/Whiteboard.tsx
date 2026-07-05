import {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpToLine,
  ChevronsDown,
  ChevronsUp,
  Trash2,
} from "lucide-react";
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

type CanvasViewport = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  zoom: number;
};

type PanState = {
  startClientX: number;
  startClientY: number;
  startCenterX: number;
  startCenterY: number;
  zoom: number;
};

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;
const DEFAULT_VIEWPORT_WIDTH = 1200;
const DEFAULT_VIEWPORT_HEIGHT = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function Whiteboard({ canvasId, user, onBack }: WhiteboardProps) {
  const socket = useCanvasSocket(canvasId);
  const history = useCanvasHistory({
    historyStatus: socket.historyStatus,
    requestRedo: socket.requestRedo,
    requestUndo: socket.requestUndo,
    sendHistoryEntry: socket.sendHistoryEntry,
  });
  const liveUpdates = useLiveShapeUpdates({
    sendPreviewOperation: socket.sendPreviewOperation,
  });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<PanState | null>(null);

  const [canvasName, setCanvasName] = useState("Canvas");
  const [canvasOwnerId, setCanvasOwnerId] = useState<string | null>(null);
  const [canvasLoading, setCanvasLoading] = useState(true);
  const [canvasRenameSaving, setCanvasRenameSaving] = useState(false);
  const [canvasRenameError, setCanvasRenameError] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [strokeColor, setStrokeColor] = useState("#1d3557");
  const [fillColor, setFillColor] = useState("#a8dadc");
  const [textColor, setTextColor] = useState("#1d3557");
  const [strokeOpacity, setStrokeOpacity] = useState(1);
  const [fillOpacity, setFillOpacity] = useState(1);
  const [textOpacity, setTextOpacity] = useState(1);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [textSize, setTextSize] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const [viewport, setViewport] = useState<CanvasViewport>({
    centerX: 0,
    centerY: 0,
    width: DEFAULT_VIEWPORT_WIDTH,
    height: DEFAULT_VIEWPORT_HEIGHT,
    zoom: 1,
  });
  const committedTextEditId = useRef<string | null>(null);

  const viewBox = useMemo(() => {
    const width = viewport.width / viewport.zoom;
    const height = viewport.height / viewport.zoom;
    return `${viewport.centerX - width / 2} ${viewport.centerY - height / 2} ${width} ${height}`;
  }, [viewport]);

  const selectedShape = useMemo(
    () => findShape(socket.state, selectedId),
    [socket.state, selectedId],
  );

  const interactions = useWhiteboardInteractions({
    canvasState: socket.state,
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
    strokeWidth,
    svgRef,
    tool,
    userId: user.id,
    sendCursor: socket.sendCursor,
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
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const updateSize = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      setViewport((current) => ({
        ...current,
        width: rect.width,
        height: rect.height,
      }));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  async function renameCanvasTitle(name: string) {
    if (canvasOwnerId !== user.id) {
      setCanvasRenameError("Only the canvas owner can rename this canvas.");
      return;
    }

    setCanvasRenameSaving(true);
    setCanvasRenameError("");
    try {
      const canvas = await api.renameCanvas(canvasId, name);
      setCanvasName(canvas.name);
    } catch (err) {
      setCanvasRenameError(err instanceof Error ? err.message : "Could not rename canvas");
    } finally {
      setCanvasRenameSaving(false);
    }
  }

  function shouldPanCanvas(event: PointerEvent<SVGSVGElement>): boolean {
    const target = event.target;
    const isBackground =
      target instanceof SVGElement && target.dataset.canvasBackground === "true";
    return event.button === 1 || (tool === "select" && isBackground);
  }

  function startCanvasPan(event: PointerEvent<SVGElement>) {
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    panRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCenterX: viewport.centerX,
      startCenterY: viewport.centerY,
      zoom: viewport.zoom,
    };
  }

  function handleCanvasPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (shouldPanCanvas(event)) {
      startCanvasPan(event);
      setSelectedId(null);
      return;
    }

    interactions.handleCanvasPointerDown(event);
  }

  function handleCanvasPointerMove(event: PointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    if (pan) {
      const dx = event.clientX - pan.startClientX;
      const dy = event.clientY - pan.startClientY;
      setViewport((current) => ({
        ...current,
        centerX: pan.startCenterX - dx / pan.zoom,
        centerY: pan.startCenterY - dy / pan.zoom,
      }));
      return;
    }

    interactions.handlePointerMove(event);
  }

  function handleCanvasPointerUp() {
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    interactions.handlePointerUp();
  }

  function handleShapePointerDown(event: PointerEvent<SVGElement>, shape: Shape) {
    if (event.button === 1) {
      event.stopPropagation();
      startCanvasPan(event);
      return;
    }
    interactions.handleShapePointerDown(event, shape);
  }

  function handleCanvasWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    setViewport((current) => {
      const nextZoom = clamp(
        current.zoom * Math.exp(-event.deltaY * 0.001),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const worldX = current.centerX + (offsetX - current.width / 2) / current.zoom;
      const worldY = current.centerY + (offsetY - current.height / 2) / current.zoom;
      return {
        ...current,
        centerX: worldX - (offsetX - current.width / 2) / nextZoom,
        centerY: worldY - (offsetY - current.height / 2) / nextZoom,
        zoom: nextZoom,
      };
    });
  }

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
    setStrokeWidth(selectedShape.strokeWidth);
    if (selectedShape.type !== "line") {
      setFillColor(selectedShape.fillColor);
      setFillOpacity(selectedShape.fillOpacity ?? 1);
    }
    if (selectedShape.type === "text") {
      setTextColor(selectedShape.textColor ?? selectedShape.strokeColor);
      setTextOpacity(selectedShape.textOpacity ?? selectedShape.strokeOpacity ?? 1);
      setTextSize(selectedShape.fontSize);
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
        ownerId={canvasOwnerId}
        renaming={canvasRenameSaving}
        revision={socket.revision}
        user={user}
        onBack={onBack}
        onRename={(name) => void renameCanvasTitle(name)}
        onOpenShare={() => setShareOpen(true)}
      />
      {canvasRenameError ? <div className="board-error-banner">{canvasRenameError}</div> : null}

      <div className="board-layout">
        <Toolbar
          tool={tool}
          strokeColor={strokeColor}
          fillColor={fillColor}
          textColor={textColor}
          strokeOpacity={strokeOpacity}
          fillOpacity={fillOpacity}
          textOpacity={textOpacity}
          strokeWidth={strokeWidth}
          textSize={textSize}
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
          onStrokeWidthChange={(width) => {
            setStrokeWidth(width);
          }}
          onTextSizeChange={(size) => {
            setTextSize(size);
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
          onStrokeWidthCommit={(width) => {
            interactions.updateSelectedColor({ strokeWidth: width } as Partial<Shape>);
          }}
          onTextSizeCommit={(size) => {
            if (selectedShape?.type === "text") {
              interactions.updateSelectedColor({ fontSize: size } as Partial<Shape>);
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
                  <button className="inline-icon-button" onClick={onBack} type="button">
                    <ArrowLeft aria-hidden="true" size={17} />
                    <span>Back to canvases</span>
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
              viewBox={viewBox}
              zoom={viewport.zoom}
              onCanvasPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onWheel={handleCanvasWheel}
              onShapePointerDown={handleShapePointerDown}
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
        <ArrowUpToLine aria-hidden="true" size={16} />
        <span>Bring to front</span>
      </button>
      <button onClick={onBringForward} type="button">
        <ChevronsUp aria-hidden="true" size={16} />
        <span>Bring forward</span>
      </button>
      <button onClick={onSendBackward} type="button">
        <ChevronsDown aria-hidden="true" size={16} />
        <span>Send backward</span>
      </button>
      <button onClick={onSendToBack} type="button">
        <ArrowDownToLine aria-hidden="true" size={16} />
        <span>Send to back</span>
      </button>
      <button className="danger" onClick={onDelete} type="button">
        <Trash2 aria-hidden="true" size={16} />
        <span>Delete</span>
      </button>
    </div>
  );
}
