import { useEffect, useRef } from "react";
import {
  Circle,
  type LucideIcon,
  MousePointer2,
  PaintBucket,
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
  styleDisabled?: boolean;
  onToolChange: (tool: Tool) => void;
  onStrokeColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onTextColorChange: (color: string) => void;
  onStrokeColorCommit: (color: string) => void;
  onFillColorCommit: (color: string) => void;
  onTextColorCommit: (color: string) => void;
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
  { id: "bucket", label: "Paint bucket", icon: PaintBucket },
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
  styleDisabled = false,
  onToolChange,
  onStrokeColorChange,
  onFillColorChange,
  onTextColorChange,
  onStrokeColorCommit,
  onFillColorCommit,
  onTextColorCommit,
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
          <ColorInput
            value={strokeColor}
            disabled={styleDisabled}
            onChange={onStrokeColorChange}
            onCommit={onStrokeColorCommit}
          />
          <AlphaSlider
            label="Stroke opacity"
            value={strokeOpacity}
            disabled={styleDisabled}
            onChange={onStrokeOpacityChange}
            onCommit={onStrokeOpacityCommit}
          />
          <StrokeWidthSlider
            value={strokeWidth}
            disabled={styleDisabled}
            onChange={onStrokeWidthChange}
            onCommit={onStrokeWidthCommit}
          />
        </label>
        <label title="Fill color">
          Fill
          <ColorInput
            value={fillColor}
            disabled={styleDisabled}
            onChange={onFillColorChange}
            onCommit={onFillColorCommit}
          />
          <AlphaSlider
            label="Fill opacity"
            value={fillOpacity}
            disabled={styleDisabled}
            onChange={onFillOpacityChange}
            onCommit={onFillOpacityCommit}
          />
        </label>
        {showTextControls ? (
          <label title="Text color">
            Text
            <ColorInput
              value={textColor}
              disabled={styleDisabled}
              onChange={onTextColorChange}
              onCommit={onTextColorCommit}
            />
            <AlphaSlider
              label="Text opacity"
              value={textOpacity}
              disabled={styleDisabled}
              onChange={onTextOpacityChange}
              onCommit={onTextOpacityCommit}
            />
            <TextSizeSlider
              value={textSize}
              disabled={styleDisabled}
              onChange={onTextSizeChange}
              onCommit={onTextSizeCommit}
            />
          </label>
        ) : null}
      </div>

            <div className="tool-group tool-grid">
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
        <button
          aria-label="Delete selected shape"
          className="icon-button action-button danger delete-button"
          disabled={!hasSelection}
          onClick={onDelete}
          title="Delete selected shape"
          type="button"
        >
          <Trash2 aria-hidden="true" size={18} />
        </button>
      </div>
    </aside>
  );
}

type ColorInputProps = {
  value: string;
  disabled: boolean;
  onChange: (color: string) => void;
  onCommit: (color: string) => void;
};

function ColorInput({ value, disabled, onChange, onCommit }: ColorInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerOpen = useRef(false);
  const suppressNextClick = useRef(false);
  const lastCommitted = useRef(value);
  const commitTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(commitTimer.current);
  }, []);

  function commit(color: string) {
    window.clearTimeout(commitTimer.current);
    if (color === lastCommitted.current) {
      return;
    }
    lastCommitted.current = color;
    onCommit(color);
  }

  function scheduleCommit(color: string) {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => commit(color), 350);
  }

  function preview(color: string) {
    onChange(color);
    scheduleCommit(color);
  }

  return (
    <input
      ref={inputRef}
      type="color"
      value={value}
      disabled={disabled}
      onInput={(event) => {
        preview(event.currentTarget.value);
      }}
      onChange={(event) => {
        pickerOpen.current = false;
        preview(event.target.value);
      }}
      onBlur={(event) => {
        pickerOpen.current = false;
        commit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.currentTarget.blur();
        }
      }}
      onClick={(event) => {
        if (suppressNextClick.current) {
          event.preventDefault();
          suppressNextClick.current = false;
          return;
        }
        if (pickerOpen.current) {
          event.preventDefault();
          return;
        }
        pickerOpen.current = true;
      }}
      onPointerDown={(event) => {
        if (!pickerOpen.current) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        suppressNextClick.current = true;
        pickerOpen.current = false;
        inputRef.current?.blur();
      }}
    />
  );
}

type TextSizeSliderProps = {
  value: number;
  disabled?: boolean;
  onChange: (size: number) => void;
  onCommit: (size: number) => void;
};

function TextSizeSlider({ value, disabled = false, onChange, onCommit }: TextSizeSliderProps) {
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
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyUp={commitCurrentValue}
        onPointerUp={commitCurrentValue}
      />
    </div>
  );
}

type StrokeWidthSliderProps = {
  value: number;
  disabled?: boolean;
  onChange: (width: number) => void;
  onCommit: (width: number) => void;
};

function StrokeWidthSlider({ value, disabled = false, onChange, onCommit }: StrokeWidthSliderProps) {
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
        disabled={disabled}
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
  disabled?: boolean;
  onChange: (opacity: number) => void;
  onCommit: (opacity: number) => void;
};

function AlphaSlider({ label, value, disabled = false, onChange, onCommit }: AlphaSliderProps) {
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
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        onKeyUp={commitCurrentValue}
        onPointerUp={commitCurrentValue}
      />
    </div>
  );
}
