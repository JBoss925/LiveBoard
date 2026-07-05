import { ChevronRight, FileText } from "lucide-react";
import type { MouseEvent } from "react";
import type { CanvasSummary } from "../types";

type CanvasListProps = {
  canvases: CanvasSummary[];
  selectedIds: Set<string>;
  currentUserId: string;
  onOpen: (canvasId: string) => void;
  onContextMenu: (canvas: CanvasSummary, event: MouseEvent<HTMLDivElement>) => void;
  onSelect: (canvasId: string, event: MouseEvent<HTMLButtonElement>) => void;
};

export function CanvasList({
  canvases,
  selectedIds,
  currentUserId,
  onOpen,
  onContextMenu,
  onSelect,
}: CanvasListProps) {
  function handleRowClick(canvasId: string, event: MouseEvent<HTMLButtonElement>) {
    onSelect(canvasId, event);
  }

  function handleRowDoubleClick(canvasId: string) {
    onOpen(canvasId);
  }

  if (canvases.length === 0) {
    return (
      <div className="empty-state">
        <h2>No canvases yet</h2>
        <p className="muted">Create the first board for your next design review.</p>
      </div>
    );
  }

  return (
    <div className="canvas-list">
      {canvases.map((canvas) => (
        <div
          aria-selected={selectedIds.has(canvas.id)}
          className={`canvas-row ${selectedIds.has(canvas.id) ? "selected" : ""}`}
          key={canvas.id}
          onContextMenu={(event) => onContextMenu(canvas, event)}
          role="row"
        >
          <button
            className="canvas-open-button"
            onClick={(event) => handleRowClick(canvas.id, event)}
            onDoubleClick={() => handleRowDoubleClick(canvas.id)}
            type="button"
          >
            <FileText aria-hidden="true" size={18} />
            <span>
              <strong>{canvas.name}</strong>
              <small>
                Revision {canvas.revision}
                {canvas.ownerId === currentUserId ? " - Owner" : " - Shared"}
              </small>
            </span>
          </button>
          <time>{new Date(canvas.updatedAt).toLocaleString()}</time>
          <button
            aria-label={`Open ${canvas.name}`}
            className="canvas-row-open-action"
            onClick={() => onOpen(canvas.id)}
            title="Open canvas"
            type="button"
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function CanvasListLoading() {
  return (
    <div className="canvas-list skeleton-list" role="status" aria-live="polite">
      {[0, 1, 2].map((item) => (
        <div className="canvas-row skeleton-row" key={item}>
          <span className="skeleton-open">
            <span className="skeleton-icon" />
            <span className="skeleton-text">
              <span className="skeleton-line skeleton-title" />
              <span className="skeleton-line skeleton-small" />
            </span>
          </span>
          <span className="skeleton-line skeleton-date" />
        </div>
      ))}
    </div>
  );
}
