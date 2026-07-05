import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import * as api from "../api";
import type { CanvasSummary, User } from "../types";
import { CanvasList, CanvasListLoading } from "./CanvasList";
import { ConfirmModal } from "./ConfirmModal";
import { RenameCanvasModal } from "./RenameCanvasModal";
import { ShareModal } from "./ShareModal";

type DashboardProps = {
  user: User;
  onLogout: () => void;
  onOpenCanvas: (canvasId: string) => void;
};

type DashboardContextMenu = {
  canvas: CanvasSummary;
  x: number;
  y: number;
};

type DeleteConfirmation = {
  canvases: CanvasSummary[];
};

export function Dashboard({ user, onLogout, onOpenCanvas }: DashboardProps) {
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<DashboardContextMenu | null>(null);
  const [sharingCanvas, setSharingCanvas] = useState<CanvasSummary | null>(null);
  const [renamingCanvas, setRenamingCanvas] = useState<CanvasSummary | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmation | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");

  const selectedCanvases = useMemo(
    () => canvases.filter((canvas) => selectedIds.has(canvas.id)),
    [canvases, selectedIds],
  );
  async function loadCanvases() {
    setError("");
    setLoading(true);
    try {
      const nextCanvases = await api.listCanvases();
      setCanvases(nextCanvases);
      setSelectedIds((current) => {
        const availableIds = new Set(nextCanvases.map((canvas) => canvas.id));
        return new Set([...current].filter((id) => availableIds.has(id)));
      });
      setSelectionAnchorId((current) =>
        nextCanvases.some((canvas) => canvas.id === current) ? current : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load canvases");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCanvases();
  }, []);

  useEffect(() => {
    function handleSelectAll(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setSelectedIds(new Set(canvases.map((canvas) => canvas.id)));
    }

    window.addEventListener("keydown", handleSelectAll);
    return () => window.removeEventListener("keydown", handleSelectAll);
  }, [canvases]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    function closeContextMenu() {
      setContextMenu(null);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    }

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  const selectCanvas = useCallback(
    (canvasId: string, event: MouseEvent<HTMLButtonElement>) => {
      const isToggle = event.ctrlKey || event.metaKey;
      if (event.shiftKey && selectionAnchorId) {
        const anchorIndex = canvases.findIndex((canvas) => canvas.id === selectionAnchorId);
        const targetIndex = canvases.findIndex((canvas) => canvas.id === canvasId);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [start, end] =
            anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          const rangeIds = canvases.slice(start, end + 1).map((canvas) => canvas.id);
          setSelectedIds((current) => {
            const next = isToggle ? new Set(current) : new Set<string>();
            rangeIds.forEach((id) => next.add(id));
            return next;
          });
          return;
        }
      }

      setSelectionAnchorId(canvasId);
      setSelectedIds((current) => {
        if (!isToggle) {
          return new Set([canvasId]);
        }
        const next = new Set(current);
        if (next.has(canvasId)) {
          next.delete(canvasId);
        } else {
          next.add(canvasId);
        }
        return next;
      });
    },
    [canvases, selectionAnchorId],
  );

  function toggleAll() {
    setSelectedIds((current) => {
      if (current.size === canvases.length) {
        return new Set();
      }
      return new Set(canvases.map((canvas) => canvas.id));
    });
  }

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      const canvas = await api.createCanvas("Untitled canvas");
      setCanvases((current) => [canvas, ...current]);
      setSelectedIds(new Set([canvas.id]));
      setSelectionAnchorId(canvas.id);
      setRenamingCanvas(canvas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create canvas");
    } finally {
      setCreating(false);
    }
  }

  function requestDeleteCanvases(canvasesToDelete: CanvasSummary[]) {
    const ownedCanvases = canvasesToDelete.filter((canvas) => canvas.ownerId === user.id);
    if (ownedCanvases.length !== canvasesToDelete.length) {
      setError("Only canvas owners can delete canvases.");
      return;
    }
    if (ownedCanvases.length === 0) {
      return;
    }
    setError("");
    setDeleteConfirmation({ canvases: ownedCanvases });
  }

  async function confirmDeleteCanvases() {
    if (!deleteConfirmation) {
      return;
    }
    const canvasesToDelete = deleteConfirmation.canvases;
    setDeleting(true);
    setError("");
    try {
      const deletedIds = new Set(canvasesToDelete.map((canvas) => canvas.id));
      await Promise.all(canvasesToDelete.map((canvas) => api.deleteCanvas(canvas.id)));
      setCanvases((current) =>
        current.filter((canvas) => !deletedIds.has(canvas.id)),
      );
      setSelectedIds((current) =>
        new Set([...current].filter((canvasId) => !deletedIds.has(canvasId))),
      );
      setSelectionAnchorId(null);
      setDeleteConfirmation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete canvases");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteSelected() {
    requestDeleteCanvases(selectedCanvases);
  }

  async function renameCanvas(canvas: CanvasSummary, name: string) {
    if (canvas.ownerId !== user.id) {
      setRenameError("Only the canvas owner can rename this canvas.");
      return;
    }

    setRenameSaving(true);
    setRenameError("");
    try {
      const renamedCanvas = await api.renameCanvas(canvas.id, name);
      setCanvases((current) =>
        current.map((currentCanvas) =>
          currentCanvas.id === renamedCanvas.id ? renamedCanvas : currentCanvas,
        ),
      );
      setRenamingCanvas(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Could not rename canvas");
    } finally {
      setRenameSaving(false);
    }
  }

  function openContextMenu(canvas: CanvasSummary, event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setContextMenu({ canvas, x: event.clientX, y: event.clientY });
    if (!selectedIds.has(canvas.id)) {
      setSelectedIds(new Set([canvas.id]));
      setSelectionAnchorId(canvas.id);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Canvases</h1>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">{user.username}</span>
          <button
            aria-label="Log out"
            className="icon-button"
            onClick={onLogout}
            title="Log out"
            type="button"
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      <section className="dashboard-grid">
        <section className="list-panel">
          <div className="section-heading">
            <div>
              <h2>Your canvases</h2>
              <p className="muted">
                {selectedIds.size > 0
                  ? `${selectedIds.size} selected`
                  : `${canvases.length} available`}
              </p>
            </div>
            <div className="list-actions">
              {canvases.length > 0 ? (
                <button
                  aria-label={
                    selectedIds.size === canvases.length
                      ? "Clear selection"
                      : "Select all canvases"
                  }
                  className="list-text-button"
                  onClick={toggleAll}
                  type="button"
                >
                  {selectedIds.size === canvases.length ? "Clear" : "Select all"}
                </button>
              ) : null}
              <button
                aria-label="Delete selected canvases"
                className="icon-button danger"
                disabled={selectedIds.size === 0 || deleting}
                onClick={() => void handleDeleteSelected()}
                title="Delete selected canvases"
                type="button"
              >
                <Trash2 aria-hidden="true" size={18} />
              </button>
              <button
                aria-label="Refresh canvases"
                className="icon-button"
                disabled={loading}
                onClick={() => void loadCanvases()}
                title="Refresh canvases"
                type="button"
              >
                <RefreshCw aria-hidden="true" size={18} />
              </button>
              <button
                aria-label="Create canvas"
                className="icon-button primary"
                disabled={creating}
                onClick={() => void handleCreate()}
                title="Create canvas"
                type="button"
              >
                <Plus aria-hidden="true" size={18} />
              </button>
            </div>
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          {loading ? <CanvasListLoading /> : null}
          {!loading ? (
            <CanvasList
              canvases={canvases}
              currentUserId={user.id}
              selectedIds={selectedIds}
              onOpen={onOpenCanvas}
              onContextMenu={openContextMenu}
              onSelect={selectCanvas}
            />
          ) : null}
        </section>
      </section>
      {contextMenu ? (
        <div
          className="dashboard-context-menu"
          onClick={(event) => event.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              onOpenCanvas(contextMenu.canvas.id);
              setContextMenu(null);
            }}
            type="button"
          >
            <ExternalLink aria-hidden="true" size={16} />
            <span>Open</span>
          </button>
          <button
            onClick={() => {
              setSharingCanvas(contextMenu.canvas);
              setContextMenu(null);
            }}
            type="button"
          >
            <Share2 aria-hidden="true" size={16} />
            <span>Share</span>
          </button>
          <button
            disabled={contextMenu.canvas.ownerId !== user.id}
            onClick={() => {
              setRenameError("");
              setRenamingCanvas(contextMenu.canvas);
              setContextMenu(null);
            }}
            type="button"
          >
            <Pencil aria-hidden="true" size={16} />
            <span>Rename</span>
          </button>
          <button
            className="danger"
            disabled={contextMenu.canvas.ownerId !== user.id || deleting}
            onClick={() => {
              const canvas = contextMenu.canvas;
              setContextMenu(null);
              requestDeleteCanvases([canvas]);
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" size={16} />
            <span>Delete</span>
          </button>
        </div>
      ) : null}
      {sharingCanvas ? (
        <ShareModal
          canvasId={sharingCanvas.id}
          currentUserId={user.id}
          ownerId={sharingCanvas.ownerId}
          onClose={() => setSharingCanvas(null)}
        />
      ) : null}
      {renamingCanvas ? (
        <RenameCanvasModal
          error={renameError}
          initialName={renamingCanvas.name}
          saving={renameSaving}
          onClose={() => {
            setRenameError("");
            setRenamingCanvas(null);
          }}
          onRename={(name) => void renameCanvas(renamingCanvas, name)}
        />
      ) : null}
      {deleteConfirmation ? (
        <ConfirmModal
          confirmLabel={
            deleteConfirmation.canvases.length === 1 ? "Delete canvas" : "Delete canvases"
          }
          loading={deleting}
          title={
            deleteConfirmation.canvases.length === 1
              ? "Delete canvas?"
              : `Delete ${deleteConfirmation.canvases.length} canvases?`
          }
          variant="danger"
          onCancel={() => {
            if (!deleting) {
              setDeleteConfirmation(null);
            }
          }}
          onConfirm={() => void confirmDeleteCanvases()}
        >
          <p>
            {deleteConfirmation.canvases.length === 1
              ? `This will permanently delete "${deleteConfirmation.canvases[0].name}".`
              : "This will permanently delete the selected canvases."}
          </p>
          <p className="muted">This action cannot be undone.</p>
        </ConfirmModal>
      ) : null}
    </main>
  );
}
