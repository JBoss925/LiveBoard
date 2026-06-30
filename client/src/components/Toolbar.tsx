import type { Tool } from "../types";

type ToolbarProps = {
  tool: Tool;
  strokeColor: string;
  fillColor: string;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onToolChange: (tool: Tool) => void;
  onStrokeColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

const tools: Array<{ id: Tool; label: string }> = [
  { id: "select", label: "Select" },
  { id: "rect", label: "Rect" },
  { id: "ellipse", label: "Ellipse" },
  { id: "line", label: "Line" },
  { id: "text", label: "Text" },
];

export function Toolbar({
  tool,
  strokeColor,
  fillColor,
  canUndo,
  canRedo,
  hasSelection,
  onToolChange,
  onStrokeColorChange,
  onFillColorChange,
  onDelete,
  onUndo,
  onRedo,
}: ToolbarProps) {
  return (
    <aside className="toolbar">
      <div className="tool-group">
        {tools.map((item) => (
          <button
            className={tool === item.id ? "active" : ""}
            key={item.id}
            onClick={() => onToolChange(item.id)}
            title={item.label}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="tool-group color-group">
        <label title="Stroke color">
          Stroke
          <input
            type="color"
            value={strokeColor}
            onChange={(event) => onStrokeColorChange(event.target.value)}
          />
        </label>
        <label title="Fill color">
          Fill
          <input
            type="color"
            value={fillColor}
            onChange={(event) => onFillColorChange(event.target.value)}
          />
        </label>
      </div>

      <div className="tool-group">
        <button disabled={!hasSelection} onClick={onDelete} type="button">
          Delete
        </button>
        <button disabled={!canUndo} onClick={onUndo} type="button">
          Undo
        </button>
        <button disabled={!canRedo} onClick={onRedo} type="button">
          Redo
        </button>
      </div>
    </aside>
  );
}
