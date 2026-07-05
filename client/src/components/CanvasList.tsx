import { ChevronRight, FileText } from "lucide-react";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import type { CanvasSummary } from "../types";

type CanvasListProps = {
  canvases: CanvasSummary[];
  selectedIds: Set<string>;
  currentUserId: string;
  nested?: boolean;
  nestingLevel?: number;
  showOwner?: boolean;
  unframed?: boolean;
  onOpen: (canvasId: string) => void;
  onContextMenu: (canvas: CanvasSummary, event: MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (canvas: CanvasSummary, event: DragEvent<HTMLDivElement>) => void;
  onDropOnCanvas?: (canvas: CanvasSummary, event: DragEvent<HTMLDivElement>) => void;
  onSelect: (canvasId: string, event: MouseEvent<HTMLButtonElement>) => void;
};

export function CanvasList({
  canvases,
  selectedIds,
  currentUserId,
  nested = false,
  nestingLevel = 0,
  showOwner = false,
  unframed = false,
  onOpen,
  onContextMenu,
  onDragStart,
  onDropOnCanvas,
  onSelect,
}: CanvasListProps) {
  if (canvases.length === 0) {
    return null;
  }

  return (
    <div className={`canvas-list ${unframed ? "canvas-list-unframed" : ""}`}>
      {canvases.map((canvas) => (
        <CanvasRow
          canvas={canvas}
          currentUserId={currentUserId}
          key={canvas.id}
          nested={nested}
          nestingLevel={nestingLevel}
          selected={selectedIds.has(canvas.id)}
          showOwner={showOwner}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDropOnCanvas={onDropOnCanvas}
          onOpen={onOpen}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

type CanvasRowProps = {
  canvas: CanvasSummary;
  currentUserId: string;
  isLastSibling?: boolean;
  nested?: boolean;
  nestingLevel?: number;
  railTypes?: TreeRailType[];
  selected: boolean;
  showOwner?: boolean;
  onOpen: (canvasId: string) => void;
  onContextMenu: (canvas: CanvasSummary, event: MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (canvas: CanvasSummary, event: DragEvent<HTMLDivElement>) => void;
  onDropOnCanvas?: (canvas: CanvasSummary, event: DragEvent<HTMLDivElement>) => void;
  onSelect: (canvasId: string, event: MouseEvent<HTMLButtonElement>) => void;
};

export function CanvasRow({
  canvas,
  currentUserId,
  isLastSibling = false,
  nested = false,
  nestingLevel = 0,
  railTypes,
  selected,
  showOwner = false,
  onOpen,
  onContextMenu,
  onDragStart,
  onDropOnCanvas,
  onSelect,
}: CanvasRowProps) {
  const depthOffset = Math.max(0, nestingLevel - 1) * 24;
  const contentStart = 46 + depthOffset;
  const rowStyle = nested
    ? ({
        paddingLeft: contentStart,
      } as CSSProperties)
    : undefined;

  return (
    <div
      aria-selected={selected}
      className={`canvas-row ${nested ? "nested tree-row" : ""} ${
        nested && isLastSibling ? "tree-row-last" : ""
      } ${selected ? "selected" : ""}`}
      draggable={Boolean(onDragStart)}
      onContextMenu={(event) => onContextMenu(canvas, event)}
      onDragOver={(event) => {
        if (onDropOnCanvas) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDragStart={(event) => onDragStart?.(canvas, event)}
      onDrop={(event) => onDropOnCanvas?.(canvas, event)}
      role="row"
      style={rowStyle}
    >
      {nested ? (
        <TreeRails
          contentStart={contentStart}
          railTypes={railTypes ?? [isLastSibling ? "elbow" : "tee"]}
        />
      ) : null}
      <button
        className="canvas-open-button"
        onClick={(event) => onSelect(canvas.id, event)}
        onDoubleClick={() => onOpen(canvas.id)}
        type="button"
      >
        <FileText aria-hidden="true" size={18} />
        <span>
          <strong>{canvas.name}</strong>
          <small>
            Revision {canvas.revision}
            {showOwner
              ? ` - ${canvas.ownerUsername}`
              : canvas.ownerId === currentUserId
                ? " - Owner"
                : " - Shared"}
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
  );
}

export type TreeRailType = "none" | "straight" | "tee" | "elbow";

type TreeRailsProps = {
  contentStart: number;
  railTypes: TreeRailType[];
};

export function TreeRails({ contentStart, railTypes }: TreeRailsProps) {
  return (
    <div aria-hidden="true" className="tree-rails">
      {railTypes.map((type, index) => {
        const railLeft = 25 + index * 24;
        return (
          <span
            className={`tree-rail ${type}`}
            key={`${type}-${index}`}
            style={
              {
                "--tree-rail-left": `${railLeft}px`,
                "--tree-elbow-width": `${Math.max(0, contentStart - railLeft)}px`,
              } as CSSProperties
            }
          />
        );
      })}
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
