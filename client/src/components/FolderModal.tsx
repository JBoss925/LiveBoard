import { FormEvent, useEffect, useState } from "react";
import { FolderPlus, X } from "lucide-react";

type FolderModalProps = {
  error: string;
  parentName?: string;
  saving: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
};

export function FolderModal({ error, parentName, saving, onClose, onCreate }: FolderModalProps) {
  const [name, setName] = useState("New folder");

  useEffect(() => {
    const input = document.getElementById("folder-name-input");
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate(name);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="app-modal rename-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-icon">
            <FolderPlus aria-hidden="true" size={19} />
          </span>
          <div>
            <p className="eyebrow">Folder</p>
            <h2>Create folder</h2>
            {parentName ? <p className="muted">Inside {parentName}</p> : null}
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            disabled={saving}
            onClick={onClose}
            title="Close"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <form className="rename-form" onSubmit={handleSubmit}>
          <label>
            Folder name
            <input
              id="folder-name-input"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error ? <div className="error-banner">{error}</div> : null}
          <div className="modal-actions">
            <button disabled={saving} onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button" disabled={saving || !name.trim()} type="submit">
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
