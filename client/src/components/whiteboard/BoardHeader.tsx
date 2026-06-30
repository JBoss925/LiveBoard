import type { User } from "../../types";

type BoardHeaderProps = {
  canvasName: string;
  connected: boolean;
  revision: number;
  user: User;
  onBack: () => void;
};

export function BoardHeader({
  canvasName,
  connected,
  revision,
  user,
  onBack,
}: BoardHeaderProps) {
  return (
    <header className="board-header">
      <div>
        <button onClick={onBack} type="button">
          Back
        </button>
        <div>
          <p className="eyebrow">Canvas</p>
          <h1>{canvasName}</h1>
        </div>
      </div>
      <div className="board-meta">
        <span className={connected ? "status connected" : "status"}>
          {connected ? "Connected" : "Reconnecting"}
        </span>
        <span>Revision {revision}</span>
        <span>{user.username}</span>
      </div>
    </header>
  );
}
