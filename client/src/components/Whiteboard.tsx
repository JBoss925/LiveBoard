import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import { useCanvasHistory } from "../hooks/useCanvasHistory";
import { useCanvasSocket } from "../hooks/useCanvasSocket";
import { useLiveShapeUpdates } from "../hooks/useLiveShapeUpdates";
import { useWhiteboardInteractions } from "../hooks/useWhiteboardInteractions";
import { findShape } from "../lib/operations";
import type { Shape, Tool, User } from "../types";
import { InvitePanel } from "./InvitePanel";
import { Toolbar } from "./Toolbar";
import { BoardHeader } from "./whiteboard/BoardHeader";
import { CanvasSvg } from "./whiteboard/CanvasSvg";

type WhiteboardProps = {
  canvasId: string;
  token: string | null;
  user: User;
  onBack: () => void;
};

export function Whiteboard({ canvasId, token, user, onBack }: WhiteboardProps) {
  const socket = useCanvasSocket(canvasId, token);
  const history = useCanvasHistory({ sendOperation: socket.sendOperation });
  const liveUpdates = useLiveShapeUpdates({ sendOperation: socket.sendOperation });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [canvasName, setCanvasName] = useState("Canvas");
  const [tool, setTool] = useState<Tool>("select");
  const [strokeColor, setStrokeColor] = useState("#1f2937");
  const [fillColor, setFillColor] = useState("#dbeafe");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedShape = useMemo(
    () => findShape(socket.state, selectedId),
    [socket.state, selectedId],
  );

  const interactions = useWhiteboardInteractions({
    fillColor,
    history,
    liveUpdates,
    selectedId,
    selectedShape,
    setLocalState: socket.setLocalState,
    setSelectedId,
    setTool,
    strokeColor,
    svgRef,
    tool,
    userId: user.id,
    sendCursor: socket.sendCursor,
    sendOperation: socket.sendOperation,
  });

  useEffect(() => {
    api
      .getCanvas(canvasId)
      .then((canvas) => setCanvasName(canvas.name))
      .catch(() => setCanvasName("Canvas"));
  }, [canvasId]);

  useEffect(() => {
    if (selectedId && !selectedShape) {
      setSelectedId(null);
    }
  }, [selectedId, selectedShape]);

  return (
    <main className="board-shell">
      <BoardHeader
        canvasName={canvasName}
        connected={socket.connected}
        revision={socket.revision}
        user={user}
        onBack={onBack}
      />

      <div className="board-layout">
        <Toolbar
          tool={tool}
          strokeColor={strokeColor}
          fillColor={fillColor}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          hasSelection={Boolean(selectedShape)}
          onToolChange={setTool}
          onStrokeColorChange={(color) => {
            setStrokeColor(color);
            interactions.updateSelectedColor({ strokeColor: color } as Partial<Shape>);
          }}
          onFillColorChange={(color) => {
            setFillColor(color);
            if (selectedShape?.type !== "line") {
              interactions.updateSelectedColor({ fillColor: color } as Partial<Shape>);
            }
          }}
          onDelete={interactions.deleteSelectedShape}
          onUndo={history.undo}
          onRedo={history.redo}
        />

        <section className="canvas-stage">
          <InvitePanel canvasId={canvasId} />
          <div className="canvas-frame">
            <CanvasSvg
              canvasState={socket.state}
              remoteCursors={socket.remoteCursors}
              selectedShape={selectedShape}
              svgRef={svgRef}
              onCanvasPointerDown={interactions.handleCanvasPointerDown}
              onPointerMove={interactions.handlePointerMove}
              onPointerUp={interactions.handlePointerUp}
              onShapePointerDown={interactions.handleShapePointerDown}
              onHandlePointerDown={interactions.handleHandlePointerDown}
              onTextDoubleClick={interactions.handleTextDoubleClick}
            />
          </div>
        </section>
      </div>
      <span hidden>{history.version}</span>
    </main>
  );
}
