import { useRef, useState } from "react";
import { makeOperationId } from "../lib/operations";
import type { CanvasOperation, HistoryEntry } from "../types";

type UseCanvasHistoryOptions = {
  sendOperation: (op: CanvasOperation) => void;
};

export function useCanvasHistory({ sendOperation }: UseCanvasHistoryOptions) {
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const [version, setVersion] = useState(0);

  function touchHistory() {
    setVersion((current) => current + 1);
  }

  function pushHistory(entry: HistoryEntry) {
    undoStack.current.push(entry);
    redoStack.current = [];
    touchHistory();
  }

  function sendWithHistory(entry: HistoryEntry) {
    sendOperation(entry.forward);
    pushHistory(entry);
  }

  function undo() {
    const entry = undoStack.current.pop();
    if (!entry) {
      return;
    }
    sendOperation(reissueOperation(entry.inverse));
    redoStack.current.push(entry);
    touchHistory();
  }

  function redo() {
    const entry = redoStack.current.pop();
    if (!entry) {
      return;
    }
    sendOperation(reissueOperation(entry.forward));
    undoStack.current.push(entry);
    touchHistory();
  }

  return {
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    pushHistory,
    redo,
    sendWithHistory,
    undo,
    version,
  };
}

function reissueOperation(op: CanvasOperation): CanvasOperation {
  return { ...op, id: makeOperationId() } as CanvasOperation;
}
