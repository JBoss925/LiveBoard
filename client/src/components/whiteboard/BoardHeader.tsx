import { ArrowLeft, Users } from "lucide-react";
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
        <button
          aria-label="Back to canvases"
          className="icon-button"
          onClick={onBack}
          title="Back to canvases"
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={19} />
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
          <Users aria-hidden="true" size={19} />
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
