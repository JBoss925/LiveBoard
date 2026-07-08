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
  Group,
  Trash2,
  Ungroup,
} from "lucide-react";
import * as api from "../api";
import { useCanvasHistory } from "../hooks/useCanvasHistory";
import { useCanvasSocket } from "../hooks/useCanvasSocket";
import { useLiveShapeUpdates } from "../hooks/useLiveShapeUpdates";
import { useWhiteboardInteractions } from "../hooks/useWhiteboardInteractions";
import { getChangedFields, type Bounds } from "../lib/geometry";
import { getTopGroupId, isGroupedShape } from "../lib/groups";
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
  selectedIds: string[];
  x: number;
  y: number;
};

type SharedSelectionValues = {
  strokeColor?: string;
  fillColor?: string;
  textColor?: string;
  strokeOpacity?: number;
  fillOpacity?: number;
  textOpacity?: number;
  strokeWidth?: number;
  fontSize?: number;
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

type ColorPreviewState = {
  field: "strokeColor" | "fillColor" | "textColor";
  before: Shape[];
};

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;
const DEFAULT_VIEWPORT_WIDTH = 1200;
const DEFAULT_VIEWPORT_HEIGHT = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sharedValue<T>(values: T[]): T | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}

function getSharedSelectionValues(shapes: Shape[]): SharedSelectionValues {
  const filledShapes = shapes.filter((shape) => shape.type !== "line");
  const textShapes = shapes.filter((shape) => shape.type === "text");
  return {
    strokeColor: sharedValue(shapes.map((shape) => shape.strokeColor)),
    fillColor: sharedValue(filledShapes.map((shape) => shape.fillColor)),
    textColor: sharedValue(textShapes.map((shape) => shape.textColor)),
    strokeOpacity: sharedValue(shapes.map((shape) => shape.strokeOpacity ?? 1)),
    fillOpacity: sharedValue(filledShapes.map((shape) => shape.fillOpacity ?? 1)),
    textOpacity: sharedValue(textShapes.map((shape) => shape.textOpacity ?? 1)),
    strokeWidth: sharedValue(shapes.map((shape) => shape.strokeWidth)),
    fontSize: sharedValue(textShapes.map((shape) => shape.fontSize)),
  };
}

function shapesForIds(shapeIds: string[], shapes: Shape[]): Shape[] {
  return shapeIds
    .map((shapeId) => shapes.find((shape) => shape.id === shapeId))
    .filter((shape): shape is Shape => Boolean(shape));
}

function canGroupSelection(shapeIds: string[], shapes: Shape[]): boolean {
  const units = new Set(
    shapesForIds(shapeIds, shapes).map((shape) => getTopGroupId(shape) ?? shape.id),
  );
  return units.size > 1;
}

function canUngroupSelection(shapeIds: string[], shapes: Shape[]): boolean {
  const selectedShapes = shapesForIds(shapeIds, shapes);
  const groupId = selectedShapes[0] ? getTopGroupId(selectedShapes[0]) : null;
  return Boolean(
    selectedShapes.length > 0 &&
      groupId &&
      selectedShapes.every((shape) => getTopGroupId(shape) === groupId),
  );
}

function reconcileSelection(shapeIds: string[], shapes: Shape[]): string[] {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const nextIds = new Set<string>();

  for (const shapeId of shapeIds) {
    const shape = byId.get(shapeId);
    if (!shape) {
      continue;
    }
    const groupId = getTopGroupId(shape);
    if (!groupId) {
      nextIds.add(shape.id);
      continue;
    }

    shapes
      .filter((candidate) => getTopGroupId(candidate) === groupId)
      .forEach((candidate) => nextIds.add(candidate.id));
  }

  return [...nextIds];
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
  const colorPreviewRef = useRef<ColorPreviewState | null>(null);

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
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

  const selectedShapes = useMemo(
    () =>
      selectedIds
        .map((shapeId) => findShape(socket.state, shapeId))
        .filter((shape): shape is Shape => Boolean(shape)),
    [socket.state, selectedIds],
  );
  const selectedShape = selectedShapes.length === 1 ? selectedShapes[0] : null;
  const selectedTopGroupId = selectedShapes[0] ? getTopGroupId(selectedShapes[0]) : null;
  const isGroupedSelection = Boolean(
    selectedShapes.length > 0 &&
      selectedTopGroupId &&
      selectedShapes.every((shape) => getTopGroupId(shape) === selectedTopGroupId),
  );
  const sharedSelectionValues = useMemo(
    () => getSharedSelectionValues(selectedShapes),
    [selectedShapes],
  );

  const interactions = useWhiteboardInteractions({
    canvasState: socket.state,
    fillColor,
    fillOpacity,
    history,
    liveUpdates,
    selectedIds,
    selectedShapes,
    setLocalState: socket.setLocalState,
    setSelectedIds,
    setSelectionBox,
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
    if (socket.canvasName) {
      setCanvasName(socket.canvasName);
    }
  }, [socket.canvasName]);

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
    return event.button === 1;
  }

  function startCanvasPan(event: PointerEvent<SVGElement>) {
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    setIsPanning(true);
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
      setIsPanning(false);
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
    setSelectedIds((current) => reconcileSelection(current, socket.state.shapes));
  }, [socket.state.shapes]);

  useEffect(() => {
    colorPreviewRef.current = null;
  }, [selectedIds]);

  useEffect(() => {
    if (!textEdit) {
      return;
    }
    const shape = findShape(socket.state, textEdit.shapeId);
    if (!shape || shape.type !== "text" || isGroupedShape(shape)) {
      setTextEdit(null);
    }
  }, [socket.state.shapes, textEdit]);

  useEffect(() => {
    if (selectedShapes.length === 0 || selectedShapes.some(isGroupedShape)) {
      return;
    }
    if (sharedSelectionValues.strokeColor) {
      setStrokeColor(sharedSelectionValues.strokeColor);
    }
    if (sharedSelectionValues.strokeOpacity !== undefined) {
      setStrokeOpacity(sharedSelectionValues.strokeOpacity);
    }
    if (sharedSelectionValues.strokeWidth !== undefined) {
      setStrokeWidth(sharedSelectionValues.strokeWidth);
    }
    if (sharedSelectionValues.fillColor) {
      setFillColor(sharedSelectionValues.fillColor);
    }
    if (sharedSelectionValues.fillOpacity !== undefined) {
      setFillOpacity(sharedSelectionValues.fillOpacity);
    }
    if (sharedSelectionValues.textColor) {
      setTextColor(sharedSelectionValues.textColor);
    }
    if (sharedSelectionValues.textOpacity !== undefined) {
      setTextOpacity(sharedSelectionValues.textOpacity);
    }
    if (sharedSelectionValues.fontSize !== undefined) {
      setTextSize(sharedSelectionValues.fontSize);
    }
  }, [isGroupedSelection, selectedShapes.length, sharedSelectionValues]);

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
    const groupId = getTopGroupId(shape);
    const nextSelectedIds = selectedIds.includes(shape.id)
      ? selectedIds
      : groupId
        ? socket.state.shapes
            .filter((item) => getTopGroupId(item) === groupId)
            .map((item) => item.id)
        : [shape.id];
    if (!selectedIds.includes(shape.id)) {
      setSelectedIds(nextSelectedIds);
    }
    setContextMenu({
      shapeId: shape.id,
      selectedIds: nextSelectedIds,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleSelectionContextMenu(event: MouseEvent<SVGElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (selectedIds.length === 0) {
      return;
    }
    setContextMenu({
      shapeId: selectedIds[0],
      selectedIds,
      x: event.clientX,
      y: event.clientY,
    });
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
    if (shape.type !== "text" || isGroupedShape(shape)) {
      return;
    }
    committedTextEditId.current = null;
    setSelectedIds([shape.id]);
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
    if (!shape || shape.type !== "text" || isGroupedShape(shape) || shape.text === edit.value) {
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

  const hasSelection = selectedShapes.length > 0;
  const selectionContainsGroupedShape = selectedShapes.some(isGroupedShape);
  const canEditSelection = hasSelection && !selectionContainsGroupedShape;
  const selectionHasFill = canEditSelection && selectedShapes.some((shape) => shape.type !== "line");
  const selectionIsOnlyText =
    canEditSelection &&
    selectedShapes.length > 0 &&
    selectedShapes.every((shape) => shape.type === "text");

  function setToolbarColor(field: ColorPreviewState["field"], color: string) {
    if (field === "strokeColor") {
      setStrokeColor(color);
      return;
    }
    if (field === "fillColor") {
      setFillColor(color);
      return;
    }
    setTextColor(color);
  }

  function canEditColorField(field: ColorPreviewState["field"]): boolean {
    if (field === "fillColor") {
      return selectionHasFill;
    }
    if (field === "textColor") {
      return selectionIsOnlyText;
    }
    return canEditSelection;
  }

  function previewToolbarColor(field: ColorPreviewState["field"], color: string) {
    setToolbarColor(field, color);
    if (!canEditColorField(field)) {
      return;
    }
    if (colorPreviewRef.current?.field !== field) {
      colorPreviewRef.current = { field, before: selectedShapes };
    }
    interactions.previewSelectedColor({ [field]: color } as Partial<Shape>);
  }

  function commitToolbarColor(field: ColorPreviewState["field"], color: string) {
    setToolbarColor(field, color);
    if (!canEditColorField(field)) {
      colorPreviewRef.current = null;
      return;
    }
    const before =
      colorPreviewRef.current?.field === field
        ? colorPreviewRef.current.before
        : selectedShapes;
    colorPreviewRef.current = null;
    interactions.commitSelectedColor({ [field]: color } as Partial<Shape>, before);
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
          hasSelection={canEditSelection}
          showTextControls={selectionIsOnlyText}
          onToolChange={setTool}
          onStrokeColorChange={(color) => {
            previewToolbarColor("strokeColor", color);
          }}
          onFillColorChange={(color) => {
            previewToolbarColor("fillColor", color);
          }}
          onTextColorChange={(color) => {
            previewToolbarColor("textColor", color);
          }}
          onStrokeColorCommit={(color) => {
            commitToolbarColor("strokeColor", color);
          }}
          onFillColorCommit={(color) => {
            commitToolbarColor("fillColor", color);
          }}
          onTextColorCommit={(color) => {
            commitToolbarColor("textColor", color);
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
            if (selectionHasFill) {
              interactions.updateSelectedColor({ fillOpacity: opacity } as Partial<Shape>);
            }
          }}
          onTextOpacityCommit={(opacity) => {
            if (selectionIsOnlyText) {
              interactions.updateSelectedColor({ textOpacity: opacity } as Partial<Shape>);
            }
          }}
          onStrokeWidthCommit={(width) => {
            interactions.updateSelectedColor({ strokeWidth: width } as Partial<Shape>);
          }}
          onTextSizeCommit={(size) => {
            if (selectionIsOnlyText) {
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
              className={isPanning ? "is-panning" : ""}
              remoteCursors={socket.remoteCursors}
              selectedShapes={selectedShapes}
              selectionBox={selectionBox}
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
              onSelectionContextMenu={handleSelectionContextMenu}
              onSelectionPointerDown={interactions.handleSelectionPointerDown}
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
                onGroup={() => {
                  interactions.groupSelection(contextMenu.selectedIds);
                  setContextMenu(null);
                }}
                onUngroup={() => {
                  interactions.ungroupSelection(contextMenu.selectedIds);
                  setContextMenu(null);
                }}
                showGroup={canGroupSelection(contextMenu.selectedIds, socket.state.shapes)}
                showUngroup={canUngroupSelection(contextMenu.selectedIds, socket.state.shapes)}
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
  onGroup: () => void;
  onUngroup: () => void;
  showGroup: boolean;
  showUngroup: boolean;
};

function ShapeContextMenu({
  x,
  y,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onDelete,
  onGroup,
  onUngroup,
  showGroup,
  showUngroup,
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
      {showGroup ? (
        <button onClick={onGroup} type="button">
          <Group aria-hidden="true" size={16} />
          <span>Group</span>
        </button>
      ) : null}
      {showUngroup ? (
        <button onClick={onUngroup} type="button">
          <Ungroup aria-hidden="true" size={16} />
          <span>Ungroup</span>
        </button>
      ) : null}
      <button className="danger" onClick={onDelete} type="button">
        <Trash2 aria-hidden="true" size={16} />
        <span>Delete</span>
      </button>
    </div>
  );
}
