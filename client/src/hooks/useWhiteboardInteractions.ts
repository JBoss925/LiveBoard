import { MouseEvent, PointerEvent, RefObject, useRef } from "react";
import {
  boundsIntersect,
  getChangedFields,
  getShapeBounds,
  getSvgPoint,
  normalizeBounds,
  type Bounds,
  type Point,
} from "../lib/geometry";
import { applyOperation, makeOperationId } from "../lib/operations";
import { createBaseShape } from "../lib/shapeFactory";
import {
  boxFromPointer,
  buildBatchHistory,
  buildTransformHistory,
  defaultInteraction,
  isMeaningfulDraft,
  moveFromPointer,
  moveManyFromPointer,
  resizeFromPointer,
  updateDraftFromPointer,
  type Interaction,
} from "../lib/whiteboardInteraction";
import { useWhiteboardKeyboard } from "./useWhiteboardKeyboard";
import type {
  CanvasOperation,
  CanvasState,
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
  sendLiveUpdates: (shapes: Shape[], before: Shape[]) => void;
};

type UseWhiteboardInteractionsOptions = {
  canvasState: CanvasState;
  fillColor: string;
  fillOpacity: number;
  history: CanvasHistoryApi;
  liveUpdates: LiveUpdateApi;
  selectedIds: string[];
  selectedShapes: Shape[];
  setLocalState: React.Dispatch<React.SetStateAction<CanvasState>>;
  setSelectedIds: (shapeIds: string[]) => void;
  setSelectionBox: (box: Bounds | null) => void;
  setTool: (tool: Tool) => void;
  strokeColor: string;
  strokeOpacity: number;
  strokeWidth: number;
  svgRef: RefObject<SVGSVGElement | null>;
  tool: Tool;
  userId: string;
  sendCursor: (x: number, y: number, selectedShapeId: string | null) => void;
  onStartTextEdit: (shape: Shape) => void;
};

const MIN_BOX_SELECT_SIZE = 4;

export function useWhiteboardInteractions({
  canvasState,
  fillColor,
  fillOpacity,
  history,
  liveUpdates,
  selectedIds,
  selectedShapes,
  setLocalState,
  setSelectedIds,
  setSelectionBox,
  setTool,
  strokeColor,
  strokeOpacity,
  strokeWidth,
  svgRef,
  tool,
  userId,
  sendCursor,
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

  function selectShape(shape: Shape) {
    setSelectedIds(shape.groupId ? getGroupShapeIds(shape.groupId) : [shape.id]);
  }

  function getGroupShapeIds(groupId: string): string[] {
    return canvasState.shapes
      .filter((shape) => shape.groupId === groupId)
      .map((shape) => shape.id);
  }

  function isGroupedSelection(): boolean {
    return Boolean(
      selectedShapes.length > 0 &&
        selectedShapes[0].groupId &&
        selectedShapes.every((shape) => shape.groupId === selectedShapes[0].groupId),
    );
  }

  function editableSelection(): Shape[] {
    return isGroupedSelection() ? [] : selectedShapes;
  }

  function buildSelectionUpdate(patch: Partial<Shape>): HistoryEntry | null {
    const shapes = editableSelection();
    const after = shapes.map(
      (shape) => ({ ...shape, ...patch, updatedAt: Date.now() }) as Shape,
    );
    if (shapes.length === 1) {
      return buildTransformHistory(shapes[0], after[0]);
    }
    return buildBatchHistory(shapes, after);
  }

  function finalizeCreate(shape: Shape) {
    history.sendWithHistory({
      forward: { id: makeOperationId(), kind: "create_shape", shape },
      inverse: { id: makeOperationId(), kind: "delete_shape", shapeId: shape.id },
    });
    setSelectedIds([shape.id]);
    setTool("select");
  }

  function updateSelectedColor(patch: Partial<Shape>) {
    const entry = buildSelectionUpdate(patch);
    if (entry) {
      history.sendWithHistory(entry);
    }
  }

  function updateCanvasBackground() {
    history.sendWithHistory({
      forward: {
        id: makeOperationId(),
        kind: "update_canvas",
        patch: { backgroundColor: fillColor },
      },
      inverse: {
        id: makeOperationId(),
        kind: "update_canvas",
        patch: { backgroundColor: canvasState.backgroundColor ?? "#eff5f5" },
      },
    });
    setSelectedIds([]);
  }

  function fillShape(shape: Shape) {
    if (shape.type === "line" || shape.groupId) {
      return;
    }
    const before = shape;
    const after = {
      ...before,
      fillColor,
      fillOpacity,
      updatedAt: Date.now(),
    } as Shape;
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
    setSelectedIds([]);
  }

  function deleteSelectedShape() {
    if (isGroupedSelection() || selectedShapes.length === 0) {
      return;
    }

    history.sendWithHistory({
      forward: {
        id: makeOperationId(),
        kind: "batch",
        ops: selectedShapes.map((shape) => ({
          id: makeOperationId(),
          kind: "delete_shape",
          shapeId: shape.id,
        })),
      },
      inverse: {
        id: makeOperationId(),
        kind: "batch",
        ops: [...selectedShapes].reverse().map((shape) => ({
          id: makeOperationId(),
          kind: "create_shape",
          shape,
        })),
      },
    });
    setSelectedIds([]);
  }

  function shapesForIds(shapeIds: string[]): Shape[] {
    return shapeIds
      .map((shapeId) => canvasState.shapes.find((shape) => shape.id === shapeId))
      .filter((shape): shape is Shape => Boolean(shape));
  }

  function groupSelection(shapeIds = selectedIds) {
    const groupableShapes = shapesForIds(shapeIds).filter((shape) => !shape.groupId);
    if (groupableShapes.length < 2) {
      return;
    }
    const groupId = makeOperationId();
    const after = groupableShapes.map(
      (shape) => ({ ...shape, groupId, updatedAt: Date.now() }) as Shape,
    );
    const entry = buildBatchHistory(groupableShapes, after);
    if (!entry) {
      return;
    }
    history.sendWithHistory(entry);
    setSelectedIds(groupableShapes.map((shape) => shape.id));
  }

  function ungroupSelection(shapeIds = selectedIds) {
    const shapes = shapesForIds(shapeIds);
    const groupId = shapes[0]?.groupId;
    if (!groupId || !shapes.every((shape) => shape.groupId === groupId)) {
      return;
    }
    const after = shapes.map(
      (shape) => ({ ...shape, groupId: null, updatedAt: Date.now() }) as Shape,
    );
    const entry = buildBatchHistory(shapes, after);
    if (!entry) {
      return;
    }
    history.sendWithHistory(entry);
    setSelectedIds(shapes.map((shape) => shape.id));
  }

  function handleCanvasPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return;
    }
    const point = pointerPoint(event);
    if (tool === "select") {
      interaction.current = { mode: "box_select", start: point, current: point };
      setSelectionBox(null);
      return;
    }
    if (tool === "bucket") {
      updateCanvasBackground();
      return;
    }
    if (tool === "text") {
      const shape = createBaseShape("text", point, {
        strokeColor,
        fillColor,
        strokeOpacity,
        fillOpacity,
        strokeWidth,
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
      strokeWidth,
      createdBy: userId,
    });
    interaction.current = { mode: "draw", tool, start: point, draft };
    applyLocal({ id: makeOperationId(), kind: "create_shape", shape: draft });
  }

  function handleShapePointerDown(event: PointerEvent<SVGElement>, shape: Shape) {
    event.stopPropagation();
    if (event.button !== 0) {
      return;
    }
    if (tool === "bucket") {
      fillShape(shape);
      return;
    }
    if (tool !== "select") {
      return;
    }

    const idsForShape = shape.groupId ? getGroupShapeIds(shape.groupId) : [shape.id];
    const isAlreadySelected = idsForShape.every((shapeId) => selectedIds.includes(shapeId));
    setSelectedIds(isAlreadySelected ? selectedIds : idsForShape);

    if (!shape.groupId) {
      interaction.current = {
        mode: "move",
        start: pointerPoint(event),
        before: shape,
        last: shape,
      };
    }

    if (shape.groupId) {
      const groupShapes = canvasState.shapes.filter((item) => item.groupId === shape.groupId);
      interaction.current = {
        mode: "move_many",
        start: pointerPoint(event),
        before: groupShapes,
        last: groupShapes,
      };
    }
  }

  function handleHandlePointerDown(
    event: PointerEvent<SVGElement>,
    handle: ResizeHandle,
    shape: Shape,
  ) {
    event.stopPropagation();
    if (shape.groupId || selectedShapes.length !== 1) {
      return;
    }
    interaction.current = {
      mode: "resize",
      start: pointerPoint(event),
      handle,
      before: shape,
      last: shape,
    };
  }

  function handleSelectionPointerDown(event: PointerEvent<SVGElement>) {
    event.stopPropagation();
    if (event.button !== 0) {
      return;
    }
    if (!isGroupedSelection()) {
      return;
    }
    interaction.current = {
      mode: "move_many",
      start: pointerPoint(event),
      before: selectedShapes,
      last: selectedShapes,
    };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const point = pointerPoint(event);
    sendCursor(point.x, point.y, selectedIds[0] ?? null);
    const current = interaction.current;

    if (current.mode === "box_select") {
      const box = boxFromPointer(current, point);
      interaction.current = { ...current, current: point };
      setSelectionBox(
        box.width >= MIN_BOX_SELECT_SIZE || box.height >= MIN_BOX_SELECT_SIZE ? box : null,
      );
    }
    if (current.mode === "draw") {
      updateDraftShape(current, updateDraftFromPointer(current, point));
    }
    if (current.mode === "move") {
      moveSelectedShape(current, moveFromPointer(current, point));
    }
    if (current.mode === "move_many") {
      moveSelectedShapes(current, moveManyFromPointer(current, point));
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

  function moveSelectedShapes(
    current: Extract<Interaction, { mode: "move_many" }>,
    next: Shape[],
  ) {
    const entry = buildBatchHistory(current.last, next);
    interaction.current = { ...current, last: next };
    if (entry) {
      applyLocal(entry.forward);
    }
    liveUpdates.sendLiveUpdates(next, current.before);
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
    setSelectionBox(null);
    liveUpdates.cancelPendingLiveUpdate();

    if (current.mode === "box_select") {
      finishBoxSelect(current);
    }
    if (current.mode === "draw") {
      finishDrawingShape(current);
    }
    if (current.mode === "move" || current.mode === "resize") {
      finishTransformingShape(current);
    }
    if (current.mode === "move_many") {
      finishTransformingShapes(current);
    }
  }

  function finishBoxSelect(current: Extract<Interaction, { mode: "box_select" }>) {
    const box = normalizeBounds(current.start, current.current);
    if (box.width < MIN_BOX_SELECT_SIZE && box.height < MIN_BOX_SELECT_SIZE) {
      setSelectedIds([]);
      return;
    }

    const nextIds = new Set<string>();
    for (const shape of canvasState.shapes) {
      if (!boundsIntersect(box, getShapeBounds(shape))) {
        continue;
      }
      if (shape.groupId) {
        getGroupShapeIds(shape.groupId).forEach((shapeId) => nextIds.add(shapeId));
      } else {
        nextIds.add(shape.id);
      }
    }
    setSelectedIds([...nextIds]);
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

    history.pushHistory(entry);
  }

  function finishTransformingShapes(current: Extract<Interaction, { mode: "move_many" }>) {
    const entry = buildBatchHistory(current.before, current.last);
    if (entry) {
      history.pushHistory(entry);
    }
  }

  function handleTextDoubleClick(event: MouseEvent<SVGElement>, shape: Shape) {
    if (shape.type !== "text" || shape.groupId) {
      return;
    }
    event.stopPropagation();
    selectShape(shape);
    onStartTextEdit(shape);
  }

  useWhiteboardKeyboard({
    interaction,
    onDelete: deleteSelectedShape,
    onRedo: history.redo,
    onUndo: history.undo,
    setSelectedIds,
  });

  return {
    deleteSelectedShape,
    groupSelection,
    handleCanvasPointerDown,
    handleHandlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleSelectionPointerDown,
    handleShapePointerDown,
    handleTextDoubleClick,
    isGroupedSelection: isGroupedSelection(),
    ungroupSelection,
    updateSelectedColor,
  };
}
