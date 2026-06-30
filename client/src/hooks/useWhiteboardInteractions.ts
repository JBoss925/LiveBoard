import { MouseEvent, PointerEvent, RefObject, useRef } from "react";
import { getChangedFields, getSvgPoint, type Point } from "../lib/geometry";
import { applyOperation, makeOperationId } from "../lib/operations";
import { createBaseShape } from "../lib/shapeFactory";
import {
  buildTransformHistory,
  defaultInteraction,
  isMeaningfulDraft,
  moveFromPointer,
  resizeFromPointer,
  updateDraftFromPointer,
  type Interaction,
} from "../lib/whiteboardInteraction";
import { useWhiteboardKeyboard } from "./useWhiteboardKeyboard";
import type {
  CanvasState,
  CanvasOperation,
  HistoryEntry,
  ResizeHandle,
  Shape,
  Tool,
} from "../types";

type CanvasHistoryApi = {
  pushHistory: (entry: HistoryEntry) => void;
  redo: () => void;
  sendWithHistory: (entry: HistoryEntry) => void;
  undo: () => void;
};

type LiveUpdateApi = {
  cancelPendingLiveUpdate: () => void;
  sendLiveUpdate: (shape: Shape, before: Shape) => void;
};

type UseWhiteboardInteractionsOptions = {
  fillColor: string;
  fillOpacity: number;
  history: CanvasHistoryApi;
  liveUpdates: LiveUpdateApi;
  selectedId: string | null;
  selectedShape: Shape | null;
  setLocalState: React.Dispatch<React.SetStateAction<CanvasState>>;
  setSelectedId: (shapeId: string | null) => void;
  setTool: (tool: Tool) => void;
  strokeColor: string;
  strokeOpacity: number;
  svgRef: RefObject<SVGSVGElement | null>;
  tool: Tool;
  userId: string;
  sendCursor: (x: number, y: number, selectedShapeId: string | null) => void;
  sendOperation: (op: HistoryEntry["forward"]) => void;
  onStartTextEdit: (shape: Shape) => void;
};

export function useWhiteboardInteractions({
  fillColor,
  fillOpacity,
  history,
  liveUpdates,
  selectedId,
  selectedShape,
  setLocalState,
  setSelectedId,
  setTool,
  strokeColor,
  strokeOpacity,
  svgRef,
  tool,
  userId,
  sendCursor,
  sendOperation,
  onStartTextEdit,
}: UseWhiteboardInteractionsOptions) {
  const interaction = useRef<Interaction>(defaultInteraction);

  function applyLocal(op: CanvasOperation) {
    setLocalState((current) => applyOperation(current, op));
  }

  function pointerPoint(event: PointerEvent<SVGElement>): Point {
    if (!svgRef.current) {
      return { x: 0, y: 0 };
    }
    return getSvgPoint(event, svgRef.current);
  }

  function finalizeCreate(shape: Shape) {
    history.sendWithHistory({
      forward: { id: makeOperationId(), kind: "create_shape", shape },
      inverse: { id: makeOperationId(), kind: "delete_shape", shapeId: shape.id },
    });
    setSelectedId(shape.id);
    setTool("select");
  }

  function updateSelectedColor(patch: Partial<Shape>) {
    if (!selectedShape) {
      return;
    }
    const before = selectedShape;
    const after = { ...before, ...patch, updatedAt: Date.now() } as Shape;
    history.sendWithHistory({
      forward: {
        id: makeOperationId(),
        kind: "update_shape",
        shapeId: before.id,
        patch: getChangedFields(before, after),
      },
      inverse: {
        id: makeOperationId(),
        kind: "update_shape",
        shapeId: before.id,
        patch: getChangedFields(after, before),
      },
    });
  }

  function deleteSelectedShape() {
    if (!selectedShape) {
      return;
    }
    history.sendWithHistory({
      forward: { id: makeOperationId(), kind: "delete_shape", shapeId: selectedShape.id },
      inverse: { id: makeOperationId(), kind: "create_shape", shape: selectedShape },
    });
    setSelectedId(null);
  }

  function handleCanvasPointerDown(event: PointerEvent<SVGSVGElement>) {
    const point = pointerPoint(event);
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    if (tool === "text") {
      const shape = createBaseShape("text", point, {
        strokeColor,
        fillColor,
        strokeOpacity,
        fillOpacity,
        createdBy: userId,
      });
      finalizeCreate(shape);
      onStartTextEdit(shape);
      return;
    }

    const draft = createBaseShape(tool, point, {
      strokeColor,
      fillColor,
      strokeOpacity,
      fillOpacity,
      createdBy: userId,
    });
    interaction.current = { mode: "draw", tool, start: point, draft };
    applyLocal({ id: makeOperationId(), kind: "create_shape", shape: draft });
  }

  function handleShapePointerDown(event: PointerEvent<SVGElement>, shape: Shape) {
    event.stopPropagation();
    setSelectedId(shape.id);
    if (tool !== "select") {
      return;
    }
    interaction.current = {
      mode: "move",
      start: pointerPoint(event),
      before: shape,
      last: shape,
    };
  }

  function handleHandlePointerDown(
    event: PointerEvent<SVGElement>,
    handle: ResizeHandle,
    shape: Shape,
  ) {
    event.stopPropagation();
    interaction.current = {
      mode: "resize",
      start: pointerPoint(event),
      handle,
      before: shape,
      last: shape,
    };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const point = pointerPoint(event);
    sendCursor(point.x, point.y, selectedId);
    const current = interaction.current;

    if (current.mode === "draw") {
      updateDraftShape(current, updateDraftFromPointer(current, point));
    }
    if (current.mode === "move") {
      moveSelectedShape(current, moveFromPointer(current, point));
    }
    if (current.mode === "resize") {
      resizeSelectedShape(current, resizeFromPointer(current, point));
    }
  }

  function updateDraftShape(current: Extract<Interaction, { mode: "draw" }>, draft: Shape) {
    interaction.current = { ...current, draft };
    applyLocal({
      id: makeOperationId(),
      kind: "update_shape",
      shapeId: draft.id,
      patch: getChangedFields(current.draft, draft),
    });
  }

  function moveSelectedShape(current: Extract<Interaction, { mode: "move" }>, next: Shape) {
    interaction.current = { ...current, last: next };
    applyLocal({
      id: makeOperationId(),
      kind: "update_shape",
      shapeId: next.id,
      patch: getChangedFields(current.last, next),
    });
    liveUpdates.sendLiveUpdate(next, current.before);
  }

  function resizeSelectedShape(current: Extract<Interaction, { mode: "resize" }>, next: Shape) {
    interaction.current = { ...current, last: next };
    applyLocal({
      id: makeOperationId(),
      kind: "update_shape",
      shapeId: next.id,
      patch: getChangedFields(current.last, next),
    });
    liveUpdates.sendLiveUpdate(next, current.before);
  }

  function handlePointerUp() {
    const current = interaction.current;
    interaction.current = defaultInteraction;
    liveUpdates.cancelPendingLiveUpdate();

    if (current.mode === "draw") {
      finishDrawingShape(current);
    }
    if (current.mode === "move" || current.mode === "resize") {
      finishTransformingShape(current);
    }
  }

  function finishDrawingShape(current: Extract<Interaction, { mode: "draw" }>) {
    if (isMeaningfulDraft(current.draft)) {
      finalizeCreate(current.draft);
      return;
    }

    applyLocal({ id: makeOperationId(), kind: "delete_shape", shapeId: current.draft.id });
  }

  function finishTransformingShape(
    current: Extract<Interaction, { mode: "move" | "resize" }>,
  ) {
    const entry = buildTransformHistory(current.before, current.last);
    if (!entry) {
      return;
    }

    sendOperation(entry.forward);
    history.pushHistory(entry);
  }

  function handleTextDoubleClick(event: MouseEvent<SVGElement>, shape: Shape) {
    if (shape.type !== "text") {
      return;
    }
    event.stopPropagation();
    setSelectedId(shape.id);
    onStartTextEdit(shape);
  }

  useWhiteboardKeyboard({
    interaction,
    onDelete: deleteSelectedShape,
    onRedo: history.redo,
    onUndo: history.undo,
    setSelectedId,
  });

  return {
    deleteSelectedShape,
    handleCanvasPointerDown,
    handleHandlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleShapePointerDown,
    handleTextDoubleClick,
    updateSelectedColor,
  };
}
