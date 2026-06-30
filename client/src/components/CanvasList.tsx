import type { CanvasSummary } from "../types";

type CanvasListProps = {
  canvases: CanvasSummary[];
  onOpen: (canvasId: string) => void;
};

export function CanvasList({ canvases, onOpen }: CanvasListProps) {
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
        <button
          className="canvas-row"
          key={canvas.id}
          onClick={() => onOpen(canvas.id)}
          type="button"
        >
          <span>
            <strong>{canvas.name}</strong>
            <small>Revision {canvas.revision}</small>
          </span>
          <time>{new Date(canvas.updatedAt).toLocaleString()}</time>
        </button>
      ))}
    </div>
  );
}
