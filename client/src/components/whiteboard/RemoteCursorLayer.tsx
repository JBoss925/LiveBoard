import type { RemoteCursor } from "../../types";

type RemoteCursorLayerProps = {
  cursors: RemoteCursor[];
};

export function RemoteCursorLayer({ cursors }: RemoteCursorLayerProps) {
  return (
    <>
      {cursors.map((cursor) => (
        <g
          className="remote-cursor"
          key={cursor.userId}
          transform={`translate(${cursor.x} ${cursor.y})`}
        >
          <path d="M0 0 L0 18 L6 13 L10 22 L14 20 L10 12 L18 12 Z" />
          <text x="16" y="16">
            {cursor.username}
          </text>
        </g>
      ))}
    </>
  );
}
