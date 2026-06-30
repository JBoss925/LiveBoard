import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasOperation, CanvasState, RemoteCursor } from "../types";
import { applyOperation } from "../lib/operations";
import { throttle } from "../lib/throttle";

type SocketStatus = "connecting" | "connected" | "disconnected";

type SnapshotMessage = {
  type: "snapshot";
  canvasId: string;
  revision: number;
  state: CanvasState;
};

type AppliedMessage = {
  type: "op_applied";
  revision: number;
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

type ServerMessage =
  | SnapshotMessage
  | AppliedMessage
  | CursorMessage
  | PresenceLeaveMessage
  | { type: "error"; message: string };

export function useCanvasSocket(canvasId: string, token: string | null) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [state, setState] = useState<CanvasState>({ shapes: [] });
  const [revision, setRevision] = useState(0);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const pendingOps = useRef<CanvasOperation[]>([]);
  const seenOpIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) {
      setStatus("disconnected");
      return undefined;
    }

    let shouldReconnect = true;
    let reconnectTimer: number | undefined;

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
        if (message.type === "cursor") {
          setRemoteCursors((current) => ({
            ...current,
            [message.user.id]: {
              userId: message.user.id,
              username: message.user.username,
              x: message.x,
              y: message.y,
              selectedShapeId: message.selectedShapeId,
              lastSeen: Date.now(),
            },
          }));
        }
        if (message.type === "presence_leave") {
          setRemoteCursors((current) => {
            const next = { ...current };
            delete next[message.userId];
            return next;
          });
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setStatus("disconnected");
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
    seenOpIds.current.add(op.id);
    pendingOps.current.push(op);
    setState((current) => applyOperation(current, op));
    const payload = JSON.stringify({ type: "op", op });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(payload);
    }
  }, []);

  const sendCursorNow = useCallback((x: number, y: number, selectedShapeId: string | null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cursor", x, y, selectedShapeId }));
    }
  }, []);

  const sendCursor = useMemo(() => throttle(sendCursorNow, 40), [sendCursorNow]);

  return {
    connected: status === "connected",
    status,
    state,
    revision,
    remoteCursors: Object.values(remoteCursors),
    setLocalState: setState,
    sendOperation,
    sendCursor,
  };
}
