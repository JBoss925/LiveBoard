import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveUser, CanvasOperation, CanvasState, RemoteCursor } from "../types";
import { applyOperation } from "../lib/operations";
import { getPresenceColor, sortActiveUsers } from "../lib/presence";
import { throttle } from "../lib/throttle";

type SocketStatus = "connecting" | "connected" | "disconnected";

type SnapshotMessage = {
  type: "snapshot";
  canvasId: string;
  revision: number;
  state: CanvasState;
  users: ActiveUser[];
};

type AppliedMessage = {
  type: "op_applied";
  revision: number;
  op: CanvasOperation;
};

type PreviewMessage = {
  type: "preview_applied";
  op: CanvasOperation;
};

type CursorMessage = {
  type: "cursor";
  user: { id: string; username: string };
  x: number;
  y: number;
  selectedShapeId?: string | null;
};

type PresenceLeaveMessage = {
  type: "presence_leave";
  userId: string;
};

type PresenceJoinMessage = {
  type: "presence_join";
  user: ActiveUser;
};

type ServerMessage =
  | SnapshotMessage
  | AppliedMessage
  | PreviewMessage
  | CursorMessage
  | PresenceJoinMessage
  | PresenceLeaveMessage
  | { type: "access_removed"; message: string }
  | { type: "error"; message: string };

export function useCanvasSocket(canvasId: string, token: string | null) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [state, setState] = useState<CanvasState>({ shapes: [] });
  const [revision, setRevision] = useState(0);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingOps = useRef<CanvasOperation[]>([]);
  const seenOpIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) {
      setStatus("disconnected");
      setActiveUsers([]);
      setRemoteCursors({});
      return undefined;
    }

    let shouldReconnect = true;
    let reconnectTimer: number | undefined;
    setAccessMessage(null);

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws/canvases/${canvasId}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setStatus("connecting");

      ws.onopen = () => {
        setStatus("connected");
        for (const op of pendingOps.current) {
          ws.send(JSON.stringify({ type: "op", op }));
        }
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as ServerMessage;
        if (message.type === "snapshot") {
          setState(message.state);
          setRevision(message.revision);
          setActiveUsers(sortActiveUsers(message.users));
          pendingOps.current = [];
          seenOpIds.current.clear();
        }
        if (message.type === "op_applied") {
          setRevision(message.revision);
          pendingOps.current = pendingOps.current.filter((op) => op.id !== message.op.id);
          if (seenOpIds.current.has(message.op.id)) {
            return;
          }
          seenOpIds.current.add(message.op.id);
          setState((current) => applyOperation(current, message.op));
        }
        if (message.type === "preview_applied") {
          setState((current) => applyOperation(current, message.op));
        }
        if (message.type === "cursor") {
          setActiveUsers((current) => upsertActiveUser(current, message.user));
          setRemoteCursors((current) => ({
            ...current,
            [message.user.id]: {
              userId: message.user.id,
              username: message.user.username,
              color: getPresenceColor(message.user.id),
              x: message.x,
              y: message.y,
              selectedShapeId: message.selectedShapeId,
              lastSeen: Date.now(),
            },
          }));
        }
        if (message.type === "presence_join") {
          setActiveUsers((current) => upsertActiveUser(current, message.user));
        }
        if (message.type === "presence_leave") {
          setActiveUsers((current) =>
            current.filter((activeUser) => activeUser.id !== message.userId),
          );
          setRemoteCursors((current) => {
            const next = { ...current };
            delete next[message.userId];
            return next;
          });
        }
        if (message.type === "access_removed") {
          shouldReconnect = false;
          pendingOps.current = [];
          setActiveUsers([]);
          setRemoteCursors({});
          setAccessMessage(message.message);
          setStatus("disconnected");
          ws.close(1008);
        }
      };

      ws.onclose = (event) => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setStatus("disconnected");
        if (event.code === 1008) {
          shouldReconnect = false;
          pendingOps.current = [];
          setActiveUsers([]);
          setRemoteCursors({});
          setAccessMessage((current) => current ?? "You no longer have access to this canvas.");
        }
        if (shouldReconnect) {
          reconnectTimer = window.setTimeout(connect, 1000);
        }
      };
    };

    connect();

    return () => {
      shouldReconnect = false;
      window.clearTimeout(reconnectTimer);
      const activeSocket = wsRef.current;
      if (activeSocket?.readyState === WebSocket.OPEN) {
        activeSocket.close();
      } else if (activeSocket?.readyState === WebSocket.CONNECTING) {
        // Closing during CONNECTING causes a noisy browser warning. In the
        // common React dev remount path, wait for the connection to open and
        // immediately close it without updating stale component state.
        activeSocket.onopen = () => activeSocket.close();
        activeSocket.onmessage = null;
        activeSocket.onclose = null;
        activeSocket.onerror = null;
      }
      wsRef.current = null;
    };
  }, [canvasId, token]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 10_000;
      setRemoteCursors((current) => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([, cursor]) => cursor.lastSeen > cutoff),
        );
        return next;
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const sendOperation = useCallback((op: CanvasOperation) => {
    if (accessMessage) {
      return;
    }
    seenOpIds.current.add(op.id);
    pendingOps.current.push(op);
    setState((current) => applyOperation(current, op));
    const payload = JSON.stringify({ type: "op", op });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(payload);
    }
  }, [accessMessage]);

  const sendPreviewOperation = useCallback((op: CanvasOperation) => {
    if (accessMessage) {
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "preview_op", op }));
    }
  }, [accessMessage]);

  const sendCursorNow = useCallback((x: number, y: number, selectedShapeId: string | null) => {
    if (accessMessage) {
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cursor", x, y, selectedShapeId }));
    }
  }, [accessMessage]);

  const sendCursor = useMemo(() => throttle(sendCursorNow, 40), [sendCursorNow]);

  return {
    connected: status === "connected",
    status,
    state,
    revision,
    activeUsers,
    remoteCursors: Object.values(remoteCursors),
    accessMessage,
    setLocalState: setState,
    sendOperation,
    sendPreviewOperation,
    sendCursor,
  };
}

function upsertActiveUser(users: ActiveUser[], user: ActiveUser): ActiveUser[] {
  const withoutUser = users.filter((activeUser) => activeUser.id !== user.id);
  return sortActiveUsers([...withoutUser, user]);
}
