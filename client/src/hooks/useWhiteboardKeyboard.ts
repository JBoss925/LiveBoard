import { useEffect, RefObject } from "react";
import { defaultInteraction, type Interaction } from "../lib/whiteboardInteraction";

type UseWhiteboardKeyboardOptions = {
  interaction: RefObject<Interaction>;
  onDelete: () => void;
  onRedo: () => void;
  onUndo: () => void;
  setSelectedIds: (shapeIds: string[]) => void;
};

export function useWhiteboardKeyboard({
  interaction,
  onDelete,
  onRedo,
  onUndo,
  setSelectedIds,
}: UseWhiteboardKeyboardOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDelete();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? onRedo() : onUndo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        onRedo();
      }
      if (event.key === "Escape") {
        interaction.current = defaultInteraction;
        setSelectedIds([]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });
}
