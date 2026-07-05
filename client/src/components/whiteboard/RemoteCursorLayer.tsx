import type { RemoteCursor } from "../../types";

type RemoteCursorLayerProps = {
  cursors: RemoteCursor[];
  zoom: number;
};

export function RemoteCursorLayer({ cursors, zoom }: RemoteCursorLayerProps) {
  const cursorScale = 1 / zoom;

  return (
    <>
      {cursors.map((cursor) => (
        <g
          className="remote-cursor"
          key={cursor.userId}
          transform={`translate(${cursor.x} ${cursor.y}) scale(${cursorScale})`}
        >
          <path
            d="M0 0 L0 18 L6 13 L10 22 L14 20 L10 12 L18 12 Z"
            fill={cursor.color}
          />
          <text fill={cursor.color} x="16" y="16">
            {cursor.username}
          </text>
        </g>
      ))}
    </>
  );
}
