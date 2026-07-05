import { ArrowLeft, Users } from "lucide-react";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { getPresenceColor } from "../../lib/presence";
import type { ActiveUser, User } from "../../types";

type BoardHeaderProps = {
  activeUsers: ActiveUser[];
  canvasName: string;
  connected: boolean;
  loading: boolean;
  ownerId: string | null;
  renaming: boolean;
  revision: number;
  user: User;
  onBack: () => void;
  onRename: (name: string) => void;
  onOpenShare: () => void;
};

export function BoardHeader({
  activeUsers,
  canvasName,
  connected,
  loading,
  ownerId,
  renaming,
  revision,
  user,
  onBack,
  onRename,
  onOpenShare,
}: BoardHeaderProps) {
  const [draftName, setDraftName] = useState(canvasName);
  const skipNextCommitRef = useRef(false);
  const canRename = !loading && ownerId === user.id;

  useEffect(() => {
    setDraftName(canvasName);
  }, [canvasName]);

  function commitRename() {
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      setDraftName(canvasName);
      return;
    }
    const nextName = draftName.trim();
    if (nextName && nextName !== canvasName) {
      onRename(nextName);
    } else {
      setDraftName(canvasName);
    }
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      skipNextCommitRef.current = true;
      setDraftName(canvasName);
      event.currentTarget.blur();
    }
  }

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
          {loading ? (
            <span className="title-skeleton" />
          ) : (
            <input
              aria-label="Canvas title"
              className="board-title-input"
              disabled={!canRename || renaming}
              onBlur={commitRename}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={handleTitleKeyDown}
              title={canRename ? "Rename canvas" : "Only the owner can rename this canvas"}
              value={draftName}
            />
          )}
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
