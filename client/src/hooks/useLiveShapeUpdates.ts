import { useRef } from "react";
import { getChangedFields } from "../lib/geometry";
import { makeOperationId } from "../lib/operations";
import type { CanvasOperation, Shape } from "../types";

type UseLiveShapeUpdatesOptions = {
  sendPreviewOperation: (op: CanvasOperation) => void;
};

export function useLiveShapeUpdates({ sendPreviewOperation }: UseLiveShapeUpdatesOptions) {
  const timeout = useRef<number | undefined>(undefined);
  const lastRun = useRef(0);
  const latest = useRef<{ shapes: Shape[]; before: Shape[] } | null>(null);

  function sendLiveUpdate(shape: Shape, before: Shape) {
    sendLiveUpdates([shape], [before]);
  }

  function sendLiveUpdates(shapes: Shape[], before: Shape[]) {
    latest.current = { shapes, before };
    window.clearTimeout(timeout.current);

    const run = () => {
      if (!latest.current) {
        return;
      }
      const update = latest.current;
      latest.current = null;
      lastRun.current = Date.now();

      const ops = update.shapes
        .map((shape, index): CanvasOperation | null => {
          const previous = update.before[index];
          if (!previous) {
            return null;
          }
          const patch = getChangedFields(previous, shape);
          if (Object.keys(patch).length === 0) {
            return null;
          }
          return {
            id: makeOperationId(),
            kind: "update_shape",
            shapeId: shape.id,
            patch,
          };
        })
        .filter((op): op is CanvasOperation => Boolean(op));

      if (ops.length === 0) {
        return;
      }

      sendPreviewOperation(
        ops.length === 1 ? ops[0] : { id: makeOperationId(), kind: "batch", ops },
      );
    };

    const elapsed = Date.now() - lastRun.current;
    if (elapsed >= 45) {
      run();
      return;
    }

    timeout.current = window.setTimeout(run, 45 - elapsed);
  }

  function cancelPendingLiveUpdate() {
    window.clearTimeout(timeout.current);
    timeout.current = undefined;
    latest.current = null;
  }

  return { cancelPendingLiveUpdate, sendLiveUpdate, sendLiveUpdates };
}
