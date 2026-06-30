import { getPresenceColor } from "../../lib/presence";
import type { ActiveUser, User } from "../../types";

type BoardHeaderProps = {
  activeUsers: ActiveUser[];
  canvasName: string;
  connected: boolean;
  loading: boolean;
  revision: number;
  user: User;
  onBack: () => void;
  onOpenShare: () => void;
};

export function BoardHeader({
  activeUsers,
  canvasName,
  connected,
  loading,
  revision,
  user,
  onBack,
  onOpenShare,
}: BoardHeaderProps) {
  return (
    <header className="board-header">
      <div>
        <button onClick={onBack} type="button">
          Back
        </button>
        <div>
          <p className="eyebrow">Canvas</p>
          {loading ? <span className="title-skeleton" /> : <h1>{canvasName}</h1>}
        </div>
      </div>
      <div className="board-meta">
        <span className={connected ? "status connected" : "status"}>
          {connected ? "Connected" : "Reconnecting"}
        </span>
        <span>Revision {revision}</span>
        <PresenceStack users={activeUsers} />
        <button
          aria-label="Share canvas"
          className="icon-button"
          onClick={onOpenShare}
          title="Share canvas"
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3ZM8 12c1.66 0 3-1.34 3-3S9.66 6 8 6 5 7.34 5 9s1.34 3 3 3ZM8 14c-2.21 0-4 1.12-4 2.5V18h8v-1.5C12 15.12 10.21 14 8 14ZM16 13c-.46 0-.9.04-1.31.13.82.62 1.31 1.43 1.31 2.37V18h4v-1.5c0-1.93-1.79-3.5-4-3.5Z" />
          </svg>
        </button>
        <span>{user.username}</span>
      </div>
    </header>
  );
}

type PresenceStackProps = {
  users: ActiveUser[];
};

function PresenceStack({ users }: PresenceStackProps) {
  if (users.length === 0) {
    return null;
  }

  return (
    <div aria-label="Current editors" className="presence-stack">
      {users.slice(0, 5).map((activeUser) => (
        <span
          className="presence-avatar"
          key={activeUser.id}
          style={{ backgroundColor: getPresenceColor(activeUser.id) }}
          title={activeUser.username}
        >
          {activeUser.username.charAt(0).toUpperCase()}
        </span>
      ))}
      {users.length > 5 ? <span className="presence-more">+{users.length - 5}</span> : null}
    </div>
  );
}
