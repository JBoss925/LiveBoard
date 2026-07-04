import {
  Circle,
  type LucideIcon,
  MousePointer2,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import type { Tool } from "../types";

type ToolbarProps = {
  tool: Tool;
  strokeColor: string;
  fillColor: string;
  textColor: string;
  strokeOpacity: number;
  fillOpacity: number;
  textOpacity: number;
  strokeWidth: number;
  textSize: number;
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
  onStrokeWidthChange: (width: number) => void;
  onTextSizeChange: (size: number) => void;
  onStrokeOpacityCommit: (opacity: number) => void;
  onFillOpacityCommit: (opacity: number) => void;
  onTextOpacityCommit: (opacity: number) => void;
  onStrokeWidthCommit: (width: number) => void;
  onTextSizeCommit: (size: number) => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

const tools: Array<{ id: Tool; label: string; icon: LucideIcon }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "line", label: "Line", icon: Slash },
  { id: "text", label: "Text", icon: Type },
];

export function Toolbar({
  tool,
  strokeColor,
  fillColor,
  textColor,
  strokeOpacity,
  fillOpacity,
  textOpacity,
  strokeWidth,
  textSize,
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
  onStrokeWidthChange,
  onTextSizeChange,
  onStrokeOpacityCommit,
  onFillOpacityCommit,
  onTextOpacityCommit,
  onStrokeWidthCommit,
  onTextSizeCommit,
  onDelete,
  onUndo,
  onRedo,
}: ToolbarProps) {
  return (
    <aside className="toolbar">
      <div className="tool-group">
        <div className="tool-grid">
          {tools.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-label={item.label}
                className={`icon-button tool-button ${tool === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => onToolChange(item.id)}
                title={item.label}
                type="button"
              >
                <Icon aria-hidden="true" size={19} strokeWidth={2.1} />
              </button>
            );
          })}
        </div>
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
          <StrokeWidthSlider
            value={strokeWidth}
            onChange={onStrokeWidthChange}
            onCommit={onStrokeWidthCommit}
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
            <TextSizeSlider
              value={textSize}
              onChange={onTextSizeChange}
              onCommit={onTextSizeCommit}
            />
          </label>
        ) : null}
      </div>

      <div className="tool-group tool-grid">
        <button
          aria-label="Delete selected shape"
          className="icon-button action-button danger"
          disabled={!hasSelection}
          onClick={onDelete}
          title="Delete selected shape"
          type="button"
        >
          <Trash2 aria-hidden="true" size={18} />
        </button>
        <button
          aria-label="Undo"
          className="icon-button action-button"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo"
          type="button"
        >
          <Undo2 aria-hidden="true" size={18} />
        </button>
        <button
          aria-label="Redo"
          className="icon-button action-button"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo"
          type="button"
        >
          <Redo2 aria-hidden="true" size={18} />
        </button>
      </div>
    </aside>
  );
}

type TextSizeSliderProps = {
  value: number;
  onChange: (size: number) => void;
  onCommit: (size: number) => void;
};

function TextSizeSlider({ value, onChange, onCommit }: TextSizeSliderProps) {
  const roundedValue = Math.round(value);
  const commitCurrentValue = (event: { currentTarget: HTMLInputElement }) => {
    onCommit(Number(event.currentTarget.value));
  };

  return (
    <div className="alpha-control">
      <span>
        Text size
        <strong>{roundedValue}px</strong>
      </span>
      <input
        aria-label="Text size"
        type="range"
        min="8"
        max="72"
        value={roundedValue}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyUp={commitCurrentValue}
        onPointerUp={commitCurrentValue}
      />
    </div>
  );
}

type StrokeWidthSliderProps = {
  value: number;
  onChange: (width: number) => void;
  onCommit: (width: number) => void;
};

function StrokeWidthSlider({ value, onChange, onCommit }: StrokeWidthSliderProps) {
  const roundedValue = Math.round(value);
  const commitCurrentValue = (event: { currentTarget: HTMLInputElement }) => {
    onCommit(Number(event.currentTarget.value));
  };

  return (
    <div className="alpha-control">
      <span>
        Stroke width
        <strong>{roundedValue}px</strong>
      </span>
      <input
        aria-label="Stroke width"
        type="range"
        min="0"
        max="16"
        value={roundedValue}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyUp={commitCurrentValue}
        onPointerUp={commitCurrentValue}
      />
    </div>
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
