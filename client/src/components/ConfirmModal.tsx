import { MouseEvent, ReactNode, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

type ConfirmModalVariant = "danger" | "default";

type ConfirmModalProps = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  variant?: ConfirmModalVariant;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  loading = false,
  variant = "default",
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  function handleOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  return (
    <div
      aria-labelledby="confirm-modal-title"
      aria-modal="true"
      className="modal-backdrop"
      onMouseDown={handleOverlayMouseDown}
      role="dialog"
    >
      <section className="app-modal confirm-modal">
        <header className="modal-header">
          <div className={`modal-icon ${variant}`}>
            <AlertTriangle aria-hidden="true" size={19} />
          </div>
          <div>
            <p className="eyebrow">Confirm</p>
            <h2 id="confirm-modal-title">{title}</h2>
          </div>
          <button
            aria-label="Close confirmation"
            className="icon-button"
            disabled={loading}
            onClick={onCancel}
            title="Close confirmation"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button disabled={loading} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={variant === "danger" ? "danger-action" : "primary"}
            disabled={loading}
            onClick={onConfirm}
            type="button"
          >
            {loading ? "Working" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
