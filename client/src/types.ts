export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 800;

export type ShapeType = "rect" | "ellipse" | "line" | "text";
export type Tool = "select" | ShapeType;
export type ResizeHandle = "nw" | "ne" | "sw" | "se" | "start" | "end";

export type BaseShape = {
  id: string;
  type: ShapeType;
  strokeColor: string;
  fillColor: string;
  strokeOpacity: number;
  fillOpacity: number;
  strokeWidth: number;
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
};

export type Shape = RectShape | EllipseShape | LineShape | TextShape;

export type CanvasState = {
  shapes: Shape[];
};

export type CanvasOperation =
  | { id: string; kind: "create_shape"; shape: Shape }
  | { id: string; kind: "update_shape"; shapeId: string; patch: Partial<Shape> }
  | { id: string; kind: "delete_shape"; shapeId: string }
  | { id: string; kind: "reorder_shape"; shapeId: string; toIndex: number };

export type HistoryEntry = {
  forward: CanvasOperation;
  inverse: CanvasOperation;
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
  revision: number;
  updatedAt: string;
};

export type CanvasDetail = CanvasSummary & {
  state: CanvasState;
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
