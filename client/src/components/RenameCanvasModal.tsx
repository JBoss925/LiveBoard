import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { X } from "lucide-react";

type RenameCanvasModalProps = {
  initialName: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onRename: (name: string) => void;
};

export function RenameCanvasModal({
  initialName,
  saving,
  error,
  onClose,
  onRename,
}: RenameCanvasModalProps) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      return;
    }
    onRename(nextName);
  }

  function handleOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      aria-labelledby="rename-modal-title"
      aria-modal="true"
      className="modal-backdrop"
      onMouseDown={handleOverlayMouseDown}
      role="dialog"
    >
      <section className="rename-modal">
        <header className="share-modal-header">
          <div>
            <p className="eyebrow">Canvas</p>
            <h2 id="rename-modal-title">Rename</h2>
          </div>
          <button
            aria-label="Close rename dialog"
            className="icon-button"
            onClick={onClose}
            title="Close rename dialog"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <form className="rename-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              autoFocus
              disabled={saving}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          {error ? <small className="error-text">{error}</small> : null}
          <div className="modal-actions">
            <button disabled={saving} onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary" disabled={saving || !name.trim()} type="submit">
              {saving ? "Saving" : "Rename"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
