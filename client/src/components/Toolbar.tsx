import type { Tool } from "../types";

type ToolbarProps = {
  tool: Tool;
  strokeColor: string;
  fillColor: string;
  textColor: string;
  strokeOpacity: number;
  fillOpacity: number;
  textOpacity: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  showTextControls: boolean;
  onToolChange: (tool: Tool) => void;
  onStrokeColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onTextColorChange: (color: string) => void;
  onStrokeOpacityChange: (opacity: number) => void;
  onFillOpacityChange: (opacity: number) => void;
  onTextOpacityChange: (opacity: number) => void;
  onStrokeOpacityCommit: (opacity: number) => void;
  onFillOpacityCommit: (opacity: number) => void;
  onTextOpacityCommit: (opacity: number) => void;
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
  textColor,
  strokeOpacity,
  fillOpacity,
  textOpacity,
  canUndo,
  canRedo,
  hasSelection,
  showTextControls,
  onToolChange,
  onStrokeColorChange,
  onFillColorChange,
  onTextColorChange,
  onStrokeOpacityChange,
  onFillOpacityChange,
  onTextOpacityChange,
  onStrokeOpacityCommit,
  onFillOpacityCommit,
  onTextOpacityCommit,
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
          <AlphaSlider
            label="Stroke opacity"
            value={strokeOpacity}
            onChange={onStrokeOpacityChange}
            onCommit={onStrokeOpacityCommit}
          />
        </label>
        <label title="Fill color">
          Fill
          <input
            type="color"
            value={fillColor}
            onChange={(event) => onFillColorChange(event.target.value)}
          />
          <AlphaSlider
            label="Fill opacity"
            value={fillOpacity}
            onChange={onFillOpacityChange}
            onCommit={onFillOpacityCommit}
          />
        </label>
        {showTextControls ? (
          <label title="Text color">
            Text
            <input
              type="color"
              value={textColor}
              onChange={(event) => onTextColorChange(event.target.value)}
            />
            <AlphaSlider
              label="Text opacity"
              value={textOpacity}
              onChange={onTextOpacityChange}
              onCommit={onTextOpacityCommit}
            />
          </label>
        ) : null}
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

type AlphaSliderProps = {
  label: string;
  value: number;
  onChange: (opacity: number) => void;
  onCommit: (opacity: number) => void;
};

function AlphaSlider({ label, value, onChange, onCommit }: AlphaSliderProps) {
  const percent = Math.round(value * 100);
  const commitCurrentValue = (event: { currentTarget: HTMLInputElement }) => {
    onCommit(Number(event.currentTarget.value) / 100);
  };

  return (
    <div className="alpha-control">
      <span>
        {label}
        <strong>{percent}%</strong>
      </span>
      <input
        aria-label={label}
        type="range"
        min="0"
        max="100"
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        onKeyUp={commitCurrentValue}
        onPointerUp={commitCurrentValue}
      />
    </div>
  );
}
