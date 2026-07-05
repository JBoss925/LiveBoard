import {
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import * as api from "../api";
import type { CanvasFolder, CanvasSummary, User } from "../types";
import { CanvasList, CanvasListLoading, CanvasRow } from "./CanvasList";
import { ConfirmModal } from "./ConfirmModal";
import { FolderModal } from "./FolderModal";
import { RenameCanvasModal } from "./RenameCanvasModal";
import { ShareModal } from "./ShareModal";

type DashboardProps = {
  user: User;
  onLogout: () => void;
  onOpenCanvas: (canvasId: string) => void;
};

type DashboardContextMenu = {
  x: number;
  y: number;
} & (
  | { kind: "canvas"; canvas: CanvasSummary }
  | { kind: "folder"; folder: CanvasFolder }
  | { kind: "root" }
);

type DeleteConfirmation = {
  canvases: CanvasSummary[];
};

type FolderDeleteConfirmation = {
  folder: CanvasFolder;
};

type FolderCreateTarget = {
  parentId: string | null;
  parentName?: string;
};

type DraggedDashboardItem =
  | { type: "canvas"; id: string; parentId: string | null }
  | { type: "folder"; id: string; parentId: string | null };

type DashboardListItem =
  | { type: "folder"; id: string; sortOrder: number; name: string; folder: CanvasFolder }
  | { type: "canvas"; id: string; sortOrder: number; name: string; canvas: CanvasSummary };

type DashboardDropPlacement = "before" | "after";

const DASHBOARD_DRAG_DATA = "application/liveboard-item";

const MIN_CANVAS_LOAD_MS = 450;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function Dashboard({ user, onLogout, onOpenCanvas }: DashboardProps) {
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [folders, setFolders] = useState<CanvasFolder[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<DashboardContextMenu | null>(null);
  const [sharingCanvas, setSharingCanvas] = useState<CanvasSummary | null>(null);
  const [renamingCanvas, setRenamingCanvas] = useState<CanvasSummary | null>(null);
  const [folderCreateTarget, setFolderCreateTarget] = useState<FolderCreateTarget | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const [folderError, setFolderError] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmation | null>(null);
  const [folderDeleteConfirmation, setFolderDeleteConfirmation] =
    useState<FolderDeleteConfirmation | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [sharedSearch, setSharedSearch] = useState("");
  const [sharedOwnerFilter, setSharedOwnerFilter] = useState("all");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const selectedCanvases = useMemo(
    () => canvases.filter((canvas) => selectedIds.has(canvas.id)),
    [canvases, selectedIds],
  );
  const ownedCanvases = useMemo(
    () => canvases.filter((canvas) => canvas.ownerId === user.id),
    [canvases, user.id],
  );
  const sharedCanvases = useMemo(
    () => canvases.filter((canvas) => canvas.ownerId !== user.id),
    [canvases, user.id],
  );
  const sharedOwners = useMemo(
    () =>
      Array.from(
        new Map(sharedCanvases.map((canvas) => [canvas.ownerId, canvas.ownerUsername])).entries(),
      ).sort(([, a], [, b]) => a.localeCompare(b)),
    [sharedCanvases],
  );
  const filteredSharedCanvases = useMemo(() => {
    const normalizedSearch = sharedSearch.trim().toLowerCase();
    return sharedCanvases.filter((canvas) => {
      const matchesSearch =
        !normalizedSearch ||
        canvas.name.toLowerCase().includes(normalizedSearch) ||
        canvas.ownerUsername.toLowerCase().includes(normalizedSearch);
      const matchesOwner =
        sharedOwnerFilter === "all" || canvas.ownerId === sharedOwnerFilter;
      return matchesSearch && matchesOwner;
    });
  }, [sharedCanvases, sharedOwnerFilter, sharedSearch]);

  async function loadCanvases() {
    setError("");
    setLoading(true);
    const minimumLoad = delay(MIN_CANVAS_LOAD_MS);
    try {
      const [nextCanvases, nextFolders] = await Promise.all([
        api.listCanvases(),
        api.listFolders(),
      ]);
      setCanvases(nextCanvases);
      setFolders(nextFolders);
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
      await minimumLoad;
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
      setSelectedIds(new Set(ownedCanvases.map((canvas) => canvas.id)));
    }

    window.addEventListener("keydown", handleSelectAll);
    return () => window.removeEventListener("keydown", handleSelectAll);
  }, [ownedCanvases]);

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

  useEffect(() => {
    if (!createMenuOpen) {
      return;
    }
    function closeCreateMenu() {
      setCreateMenuOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeCreateMenu();
      }
    }

    window.addEventListener("click", closeCreateMenu);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", closeCreateMenu);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [createMenuOpen]);

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
      if (current.size === ownedCanvases.length) {
        return new Set();
      }
      return new Set(ownedCanvases.map((canvas) => canvas.id));
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

  async function createFolder(name: string) {
    setCreatingFolder(true);
    setFolderError("");
    try {
      const folder = await api.createFolder(name, folderCreateTarget?.parentId ?? null);
      setFolders((current) => [...current, folder]);
      setFolderCreateTarget(null);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "Could not create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function moveCanvas(canvas: CanvasSummary, folderId: string | null) {
    if (canvas.ownerId !== user.id) {
      setError("Only canvas owners can move canvases into folders.");
      return;
    }
    setError("");
    try {
      const movedCanvas = await api.moveCanvasToFolder(canvas.id, folderId);
      setCanvases((current) =>
        current.map((currentCanvas) =>
          currentCanvas.id === movedCanvas.id ? movedCanvas : currentCanvas,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move canvas");
    }
  }

  async function moveFolder(folder: CanvasFolder, parentId: string | null) {
    if (folder.id === parentId || isFolderDescendant(parentId, folder.id)) {
      setError("Folders cannot be moved inside themselves.");
      return;
    }
    setError("");
    try {
      const movedFolder = await api.moveFolder(folder.id, parentId);
      setFolders((current) =>
        current.map((currentFolder) =>
          currentFolder.id === movedFolder.id ? movedFolder : currentFolder,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move folder");
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

  function requestDeleteFolder(folder: CanvasFolder) {
    setError("");
    setFolderDeleteConfirmation({ folder });
  }

  async function confirmDeleteFolder() {
    if (!folderDeleteConfirmation) {
      return;
    }
    const folder = folderDeleteConfirmation.folder;
    setDeletingFolder(true);
    setError("");
    try {
      await api.deleteFolder(folder.id);
      const deletedFolderIds = descendantFolderIds(folder.id);
      setFolders((current) => current.filter((item) => !deletedFolderIds.has(item.id)));
      setCanvases((current) =>
        current.filter((canvas) => !deletedFolderIds.has(canvas.folderId ?? "")),
      );
      setSelectedIds((current) => {
        const remainingCanvasIds = new Set(
          canvases
            .filter((canvas) => !deletedFolderIds.has(canvas.folderId ?? ""))
            .map((canvas) => canvas.id),
        );
        return new Set([...current].filter((canvasId) => remainingCanvasIds.has(canvasId)));
      });
      setSelectionAnchorId(null);
      setFolderDeleteConfirmation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete folder");
    } finally {
      setDeletingFolder(false);
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

  function canvasesForFolder(folderId: string | null): CanvasSummary[] {
    return ownedCanvases
      .filter((canvas) => (canvas.folderId ?? null) === folderId)
      .sort(compareDashboardItems);
  }

  function foldersForParent(parentId: string | null): CanvasFolder[] {
    return folders
      .filter((folder) => (folder.parentId ?? null) === parentId)
      .sort(compareDashboardItems);
  }

  function itemsForParent(parentId: string | null): DashboardListItem[] {
    const folderItems = foldersForParent(parentId).map((folder) => ({
      type: "folder" as const,
      id: folder.id,
      sortOrder: folder.sortOrder,
      name: folder.name,
      folder,
    }));
    const canvasItems = canvasesForFolder(parentId).map((canvas) => ({
      type: "canvas" as const,
      id: canvas.id,
      sortOrder: canvas.sortOrder,
      name: canvas.name,
      canvas,
    }));
    return [...folderItems, ...canvasItems].sort(compareDashboardItems);
  }

  function compareDashboardItems(
    first: { sortOrder: number; name: string },
    second: { sortOrder: number; name: string },
  ) {
    return first.sortOrder - second.sortOrder || first.name.localeCompare(second.name);
  }

  function descendantFolderIds(folderId: string): Set<string> {
    const ids = new Set([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      folders.forEach((folder) => {
        if (!ids.has(folder.id) && ids.has(folder.parentId ?? "")) {
          ids.add(folder.id);
          changed = true;
        }
      });
    }
    return ids;
  }

  function isFolderDescendant(folderId: string | null, ancestorId: string): boolean {
    return folderId !== null && descendantFolderIds(ancestorId).has(folderId);
  }

  function toggleFolder(folderId: string) {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  function readDraggedItem(event: DragEvent<HTMLElement>): DraggedDashboardItem | null {
    const raw = event.dataTransfer.getData(DASHBOARD_DRAG_DATA);
    if (!raw) {
      return null;
    }
    try {
      const item = JSON.parse(raw) as DraggedDashboardItem;
      return item.type === "canvas" || item.type === "folder" ? item : null;
    } catch {
      return null;
    }
  }

  function startCanvasDrag(canvas: CanvasSummary, event: DragEvent<HTMLDivElement>) {
    if (canvas.ownerId !== user.id) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      DASHBOARD_DRAG_DATA,
      JSON.stringify({ type: "canvas", id: canvas.id, parentId: canvas.folderId ?? null }),
    );
  }

  function startFolderDrag(folder: CanvasFolder, event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      DASHBOARD_DRAG_DATA,
      JSON.stringify({ type: "folder", id: folder.id, parentId: folder.parentId ?? null }),
    );
  }

  async function placeItemInParent(
    draggedItem: DraggedDashboardItem,
    parentId: string | null,
    index: number,
  ) {
    const dragged = getDraggedListItem(draggedItem);
    if (!dragged) {
      return false;
    }
    if (
      dragged.type === "folder" &&
      (dragged.id === parentId || isFolderDescendant(parentId, dragged.id))
    ) {
      setError("Folders cannot be moved inside themselves.");
      return false;
    }

    const currentItems = itemsForParent(parentId);
    const nextItems = currentItems.filter(
      (item) => !(item.type === dragged.type && item.id === dragged.id),
    );
    const boundedIndex = Math.max(0, Math.min(index, nextItems.length));
    const movedItem: DashboardListItem =
      dragged.type === "folder"
        ? {
            ...dragged,
            folder: { ...dragged.folder, parentId },
          }
        : {
            ...dragged,
            canvas: { ...dragged.canvas, folderId: parentId },
          };
    nextItems.splice(boundedIndex, 0, movedItem);

    applyOrderedItems(parentId, nextItems);
    try {
      await api.reorderDashboardItems(
        parentId,
        nextItems.map((item) => ({ type: item.type, id: item.id })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move item");
      void loadCanvases();
    }
    return true;
  }

  function getDraggedListItem(draggedItem: DraggedDashboardItem): DashboardListItem | null {
    if (draggedItem.type === "folder") {
      const folder = folders.find((item) => item.id === draggedItem.id);
      return folder
        ? {
            type: "folder",
            id: folder.id,
            sortOrder: folder.sortOrder,
            name: folder.name,
            folder,
          }
        : null;
    }
    const canvas = canvases.find((item) => item.id === draggedItem.id);
    return canvas
      ? {
          type: "canvas",
          id: canvas.id,
          sortOrder: canvas.sortOrder,
          name: canvas.name,
          canvas,
        }
      : null;
  }

  async function reorderSiblingItems(
    draggedItem: DraggedDashboardItem,
    targetItem: DashboardListItem,
    placement: DashboardDropPlacement,
  ) {
    if (draggedItem.type === targetItem.type && draggedItem.id === targetItem.id) {
      return true;
    }

    const parentId = getItemParentId(targetItem);
    const currentItems = itemsForParent(parentId);
    const withoutDragged = currentItems.filter(
      (item) => !(item.type === draggedItem.type && item.id === draggedItem.id),
    );
    const targetIndex = withoutDragged.findIndex(
      (item) => item.type === targetItem.type && item.id === targetItem.id,
    );
    if (targetIndex === -1) {
      return false;
    }

    return placeItemInParent(
      draggedItem,
      parentId,
      placement === "after" ? targetIndex + 1 : targetIndex,
    );
  }

  function applyOrderedItems(parentId: string | null, items: DashboardListItem[]) {
    const orderByKey = new Map(
      items.map((item, index) => [`${item.type}:${item.id}`, (index + 1) * 1024]),
    );
    setFolders((current) =>
      current.map((folder) =>
        orderByKey.has(`folder:${folder.id}`)
          ? {
              ...folder,
              parentId,
              sortOrder: orderByKey.get(`folder:${folder.id}`)!,
            }
          : folder,
      ),
    );
    setCanvases((current) =>
      current.map((canvas) =>
        orderByKey.has(`canvas:${canvas.id}`)
          ? {
              ...canvas,
              folderId: parentId,
              sortOrder: orderByKey.get(`canvas:${canvas.id}`)!,
            }
          : canvas,
      ),
    );
  }

  function getItemParentId(item: DashboardListItem): string | null {
    return item.type === "folder" ? item.folder.parentId ?? null : item.canvas.folderId ?? null;
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    if (event.dataTransfer.types.includes(DASHBOARD_DRAG_DATA)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }

  function dropItemIntoFolder(folderId: string | null, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const item = readDraggedItem(event);
    if (!item) {
      return;
    }
    if (item.type === "canvas") {
      const canvas = canvases.find((currentCanvas) => currentCanvas.id === item.id);
      if (canvas && (canvas.folderId ?? null) !== folderId) {
        void moveCanvas(canvas, folderId);
      }
      return;
    }

    const folder = folders.find((currentFolder) => currentFolder.id === item.id);
    if (folder && (folder.parentId ?? null) !== folderId) {
      void moveFolder(folder, folderId);
    }
  }

  function dropItemOnSibling(targetItem: DashboardListItem, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const item = readDraggedItem(event);
    if (!item) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = (event.clientY - rect.top) / rect.height;
    const isFolderCenterDrop =
      targetItem.type === "folder" && relativeY > 0.25 && relativeY < 0.75;
    if (isFolderCenterDrop) {
      dropItemIntoFolder(targetItem.folder.id, event);
      return;
    }
    if (item.parentId === getItemParentId(targetItem)) {
      void reorderSiblingItems(item, targetItem, relativeY > 0.5 ? "after" : "before");
      return;
    }
    if (targetItem.type === "folder") {
      dropItemIntoFolder(targetItem.folder.id, event);
    }
  }

  function dropItemAtIndex(
    parentId: string | null,
    index: number,
    event: DragEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const item = readDraggedItem(event);
    if (!item) {
      return;
    }
    void placeItemInParent(item, parentId, index);
  }

  function openCanvasContextMenu(canvas: CanvasSummary, event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ kind: "canvas", canvas, x: event.clientX, y: event.clientY });
    if (!selectedIds.has(canvas.id)) {
      setSelectedIds(new Set([canvas.id]));
      setSelectionAnchorId(canvas.id);
    }
  }

  function openFolderContextMenu(folder: CanvasFolder, event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ kind: "folder", folder, x: event.clientX, y: event.clientY });
  }

  function openRootContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    setContextMenu({ kind: "root", x: event.clientX, y: event.clientY });
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
                  : `${ownedCanvases.length} owned`}
              </p>
            </div>
            <div className="list-actions">
              {ownedCanvases.length > 0 ? (
                <button
                  aria-label={
                    selectedIds.size === ownedCanvases.length
                      ? "Clear selection"
                      : "Select all canvases"
                  }
                  className="list-text-button"
                  onClick={toggleAll}
                  type="button"
                >
                  {selectedIds.size === ownedCanvases.length ? "Unselect all" : "Select all"}
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
              <div className="create-menu-wrapper" onClick={(event) => event.stopPropagation()}>
                <button
                  aria-expanded={createMenuOpen}
                  aria-label="Create"
                  className="icon-button primary"
                  disabled={creating || creatingFolder}
                  onClick={() => setCreateMenuOpen((open) => !open)}
                  title="Create"
                  type="button"
                >
                  <Plus aria-hidden="true" size={18} />
                </button>
                {createMenuOpen ? (
                  <div className="create-menu" role="menu">
                    <button
                      disabled={creating}
                      onClick={() => {
                        setCreateMenuOpen(false);
                        void handleCreate();
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <FileText aria-hidden="true" size={16} />
                      <span>Canvas</span>
                    </button>
                    <button
                      disabled={creatingFolder}
                      onClick={() => {
                        setFolderError("");
                        setFolderCreateTarget({ parentId: null });
                        setCreateMenuOpen(false);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <Folder aria-hidden="true" size={16} />
                      <span>Folder</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          {loading ? <CanvasListLoading /> : null}
          {!loading ? (
            <div
              className="canvas-list"
              onContextMenu={openRootContextMenu}
              onDragOver={allowDrop}
              onDrop={(event) => dropItemIntoFolder(null, event)}
            >
              <FolderTree
                collapsedFolderIds={collapsedFolderIds}
                currentUserId={user.id}
                itemsForParent={itemsForParent}
                level={0}
                parentId={null}
                selectedIds={selectedIds}
                onCanvasContextMenu={openCanvasContextMenu}
                onCanvasDragStart={startCanvasDrag}
                onDropAtIndex={dropItemAtIndex}
                onDropOnSibling={dropItemOnSibling}
                onFolderContextMenu={openFolderContextMenu}
                onFolderDragStart={startFolderDrag}
                onOpen={onOpenCanvas}
                onSelect={selectCanvas}
                onToggleFolder={toggleFolder}
              />
            </div>
          ) : null}
        </section>

        <section className="list-panel shared-panel">
          <div className="section-heading shared-heading">
            <div>
              <h2>Shared with You</h2>
              <p className="muted">{filteredSharedCanvases.length} visible</p>
            </div>
            <div className="shared-filters">
              <label className="search-field">
                <Search aria-hidden="true" size={16} />
                <input
                  placeholder="Search shared canvases"
                  value={sharedSearch}
                  onChange={(event) => setSharedSearch(event.target.value)}
                />
              </label>
              <select
                aria-label="Filter shared canvases by owner"
                value={sharedOwnerFilter}
                onChange={(event) => setSharedOwnerFilter(event.target.value)}
              >
                <option value="all">All owners</option>
                {sharedOwners.map(([ownerId, ownerUsername]) => (
                  <option key={ownerId} value={ownerId}>
                    {ownerUsername}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {loading ? <CanvasListLoading /> : null}
          {!loading ? (
            <CanvasList
              canvases={filteredSharedCanvases}
              currentUserId={user.id}
              selectedIds={selectedIds}
              showOwner
              onOpen={onOpenCanvas}
              onContextMenu={openCanvasContextMenu}
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
          {contextMenu.kind === "canvas" ? (
            <>
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
            </>
          ) : null}
          {contextMenu.kind === "folder" ? (
            <>
              <button
                onClick={() => {
                  setFolderError("");
                  setFolderCreateTarget({
                    parentId: contextMenu.folder.id,
                    parentName: contextMenu.folder.name,
                  });
                  setContextMenu(null);
                }}
                type="button"
              >
                <Folder aria-hidden="true" size={16} />
                <span>New folder</span>
              </button>
              <button
                className="danger"
                disabled={deletingFolder}
                onClick={() => {
                  const folder = contextMenu.folder;
                  setContextMenu(null);
                  requestDeleteFolder(folder);
                }}
                type="button"
              >
                <Trash2 aria-hidden="true" size={16} />
                <span>Delete folder</span>
              </button>
            </>
          ) : null}
          {contextMenu.kind === "root" ? (
            <>
              <button
                onClick={() => {
                  setFolderError("");
                  setFolderCreateTarget({ parentId: null });
                  setContextMenu(null);
                }}
                type="button"
              >
                <Folder aria-hidden="true" size={16} />
                <span>New folder</span>
              </button>
              {folders.length > 0 ? (
                <button
                  onClick={() => {
                    setCollapsedFolderIds(new Set());
                    setContextMenu(null);
                  }}
                  type="button"
                >
                  <ChevronDown aria-hidden="true" size={16} />
                  <span>Expand all folders</span>
                </button>
              ) : null}
            </>
          ) : null}
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
      {folderCreateTarget ? (
        <FolderModal
          error={folderError}
          parentName={folderCreateTarget.parentName}
          saving={creatingFolder}
          onClose={() => {
            if (!creatingFolder) {
              setFolderCreateTarget(null);
            }
          }}
          onCreate={(name) => void createFolder(name)}
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
      {folderDeleteConfirmation ? (
        <ConfirmModal
          confirmLabel="Delete folder"
          loading={deletingFolder}
          title="Delete folder?"
          variant="danger"
          onCancel={() => {
            if (!deletingFolder) {
              setFolderDeleteConfirmation(null);
            }
          }}
          onConfirm={() => void confirmDeleteFolder()}
        >
          <p>
            This will permanently delete "{folderDeleteConfirmation.folder.name}" and every
            canvas and folder inside it.
          </p>
          <p className="muted">This action cannot be undone.</p>
        </ConfirmModal>
      ) : null}
    </main>
  );
}

type FolderTreeProps = {
  collapsedFolderIds: Set<string>;
  currentUserId: string;
  itemsForParent: (parentId: string | null) => DashboardListItem[];
  level: number;
  parentId: string | null;
  selectedIds: Set<string>;
  onCanvasContextMenu: (canvas: CanvasSummary, event: MouseEvent<HTMLDivElement>) => void;
  onCanvasDragStart: (canvas: CanvasSummary, event: DragEvent<HTMLDivElement>) => void;
  onDropAtIndex: (
    parentId: string | null,
    index: number,
    event: DragEvent<HTMLElement>,
  ) => void;
  onDropOnSibling: (item: DashboardListItem, event: DragEvent<HTMLElement>) => void;
  onFolderContextMenu: (folder: CanvasFolder, event: MouseEvent<HTMLDivElement>) => void;
  onFolderDragStart: (folder: CanvasFolder, event: DragEvent<HTMLDivElement>) => void;
  onOpen: (canvasId: string) => void;
  onSelect: (canvasId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onToggleFolder: (folderId: string) => void;
};

function FolderTree({
  collapsedFolderIds,
  currentUserId,
  itemsForParent,
  level,
  parentId,
  selectedIds,
  onCanvasContextMenu,
  onCanvasDragStart,
  onDropAtIndex,
  onDropOnSibling,
  onFolderContextMenu,
  onFolderDragStart,
  onOpen,
  onSelect,
  onToggleFolder,
}: FolderTreeProps) {
  return (
    <>
      {itemsForParent(parentId).map((item, index) => {
        if (item.type === "canvas") {
          return (
            <DashboardItemFrame
              key={item.id}
              parentId={parentId}
              beforeIndex={index}
              onDropAtIndex={onDropAtIndex}
            >
              <CanvasRow
                canvas={item.canvas}
                currentUserId={currentUserId}
                nested={level > 0}
                nestingLevel={level}
                selected={selectedIds.has(item.id)}
                onContextMenu={onCanvasContextMenu}
                onDragStart={onCanvasDragStart}
                onDropOnCanvas={(canvas, event) =>
                  onDropOnSibling({ ...item, canvas }, event)
                }
                onOpen={onOpen}
                onSelect={onSelect}
              />
            </DashboardItemFrame>
          );
        }
        const folder = item.folder;
        const collapsed = collapsedFolderIds.has(folder.id);
        const childCount = itemsForParent(folder.id).length;
        const ToggleIcon = collapsed ? ChevronRight : ChevronDown;
        return (
          <DashboardItemFrame
            key={folder.id}
            parentId={parentId}
            beforeIndex={index}
            onDropAtIndex={onDropAtIndex}
          >
            <div className="folder-list-group">
              <div
                className="folder-row"
                draggable
                onContextMenu={(event) => onFolderContextMenu(folder, event)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDragStart={(event) => onFolderDragStart(folder, event)}
                onDrop={(event) => onDropOnSibling(item, event)}
                style={{ paddingLeft: 14 + level * 24 }}
              >
                <button
                  aria-expanded={!collapsed}
                  className="folder-toggle-button"
                  onClick={() => onToggleFolder(folder.id)}
                  type="button"
                >
                  <ToggleIcon aria-hidden="true" size={18} />
                </button>
                <Folder aria-hidden="true" size={18} />
                <span>{folder.name}</span>
                <small>{childCount}</small>
              </div>
              {!collapsed ? (
                <FolderTree
                  collapsedFolderIds={collapsedFolderIds}
                  currentUserId={currentUserId}
                  itemsForParent={itemsForParent}
                  level={level + 1}
                  parentId={folder.id}
                  selectedIds={selectedIds}
                  onCanvasContextMenu={onCanvasContextMenu}
                  onCanvasDragStart={onCanvasDragStart}
                  onDropAtIndex={onDropAtIndex}
                  onDropOnSibling={onDropOnSibling}
                  onFolderContextMenu={onFolderContextMenu}
                  onFolderDragStart={onFolderDragStart}
                  onOpen={onOpen}
                  onSelect={onSelect}
                  onToggleFolder={onToggleFolder}
                />
              ) : null}
            </div>
          </DashboardItemFrame>
        );
      })}
      <DashboardDropSlot
        final
        parentId={parentId}
        index={itemsForParent(parentId).length}
        onDropAtIndex={onDropAtIndex}
      />
    </>
  );
}

type DashboardItemFrameProps = {
  children: ReactNode;
  parentId: string | null;
  beforeIndex: number;
  onDropAtIndex: (
    parentId: string | null,
    index: number,
    event: DragEvent<HTMLElement>,
  ) => void;
};

function DashboardItemFrame({
  children,
  parentId,
  beforeIndex,
  onDropAtIndex,
}: DashboardItemFrameProps) {
  return (
    <>
      <DashboardDropSlot
        first={beforeIndex === 0}
        parentId={parentId}
        index={beforeIndex}
        onDropAtIndex={onDropAtIndex}
      />
      {children}
    </>
  );
}

type DashboardDropSlotProps = {
  final?: boolean;
  first?: boolean;
  parentId: string | null;
  index: number;
  onDropAtIndex: (
    parentId: string | null,
    index: number,
    event: DragEvent<HTMLElement>,
  ) => void;
};

function DashboardDropSlot({
  final = false,
  first = false,
  parentId,
  index,
  onDropAtIndex,
}: DashboardDropSlotProps) {
  const [active, setActive] = useState(false);
  return (
    <div
      className={`dashboard-drop-slot ${first ? "first" : ""} ${
        final ? "final" : ""
      } ${active ? "active" : ""}`}
      onDragLeave={() => setActive(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setActive(true);
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        setActive(false);
        onDropAtIndex(parentId, index, event);
      }}
    />
  );
}
