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
  const latest = useRef<{ shape: Shape; before: Shape } | null>(null);

  function sendLiveUpdate(shape: Shape, before: Shape) {
    latest.current = { shape, before };
    window.clearTimeout(timeout.current);

    const run = () => {
      if (!latest.current) {
        return;
      }
      const update = latest.current;
      latest.current = null;
      lastRun.current = Date.now();

      const patch = getChangedFields(update.before, update.shape);
      if (Object.keys(patch).length === 0) {
        return;
      }

      sendPreviewOperation({
        id: makeOperationId(),
        kind: "update_shape",
        shapeId: update.shape.id,
        patch,
      });
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

  return { cancelPendingLiveUpdate, sendLiveUpdate };
}
