export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 800;

export type ShapeType = "rect" | "ellipse" | "line" | "text";
export type Tool = "select" | "bucket" | ShapeType;
export type TextAlign = "left" | "center" | "right";
export type ResizeHandle = "nw" | "ne" | "sw" | "se" | "start" | "end";
export type TransformHandle = ResizeHandle | "rotate";

export type BaseShape = {
  id: string;
  type: ShapeType;
  groupId?: string | null;
  groupIds?: string[] | null;
  strokeColor: string;
  fillColor: string;
  strokeOpacity: number;
  fillOpacity: number;
  strokeWidth: number;
  rotation?: number;
  createdBy: string;
  updatedAt: number;
};

export type RectShape = BaseShape & {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EllipseShape = BaseShape & {
  type: "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LineShape = BaseShape & {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TextShape = BaseShape & {
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  textColor: string;
  textOpacity: number;
  fontSize: number;
  textAlign?: TextAlign;
};

export type Shape = RectShape | EllipseShape | LineShape | TextShape;

export type CanvasState = {
  backgroundColor?: string;
  shapes: Shape[];
};

export type CanvasOperation =
  | { id: string; kind: "batch"; ops: CanvasOperation[] }
  | { id: string; kind: "create_shape"; shape: Shape }
  | { id: string; kind: "update_canvas"; patch: Partial<CanvasState> }
  | { id: string; kind: "update_shape"; shapeId: string; patch: Partial<Shape> }
  | { id: string; kind: "delete_shape"; shapeId: string }
  | { id: string; kind: "reorder_shape"; shapeId: string; toIndex: number };

export type HistoryEntry = {
  forward: CanvasOperation;
  inverse: CanvasOperation;
};

export type HistoryStatus = {
  canUndo: boolean;
  canRedo: boolean;
};

export type User = {
  id: string;
  username: string;
  email: string;
};

export type ActiveUser = {
  id: string;
  username: string;
  email?: string;
};

export type CanvasSummary = {
  id: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
  folderId?: string | null;
  sortOrder: number;
  revision: number;
  updatedAt: string;
};

export type CanvasDetail = CanvasSummary & {
  state: CanvasState;
  history?: HistoryStatus;
};

export type CanvasFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  updatedAt: string;
};

export type RemoteCursor = {
  userId: string;
  username: string;
  color: string;
  x: number;
  y: number;
  selectedShapeId?: string | null;
  lastSeen: number;
};
