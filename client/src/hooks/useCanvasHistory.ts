import { useState } from "react";
import type { HistoryEntry, HistoryStatus } from "../types";

type UseCanvasHistoryOptions = {
  historyStatus: HistoryStatus;
  requestRedo: () => void;
  requestUndo: () => void;
  sendHistoryEntry: (entry: HistoryEntry) => void;
};

export function useCanvasHistory({
  historyStatus,
  requestRedo,
  requestUndo,
  sendHistoryEntry,
}: UseCanvasHistoryOptions) {
  const [version, setVersion] = useState(0);

  function touchHistory() {
    setVersion((current) => current + 1);
  }

  function sendWithHistory(entry: HistoryEntry) {
    sendHistoryEntry(entry);
    touchHistory();
  }

  function undo() {
    requestUndo();
    touchHistory();
  }

  function redo() {
    requestRedo();
    touchHistory();
  }

  return {
    canUndo: historyStatus.canUndo,
    canRedo: historyStatus.canRedo,
    pushHistory: sendWithHistory,
    redo,
    sendWithHistory,
    undo,
    version,
  };
}
