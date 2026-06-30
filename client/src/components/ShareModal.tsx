import { FormEvent, MouseEvent, useEffect, useState } from "react";
import * as api from "../api";
import type { User } from "../types";

type ShareModalProps = {
  canvasId: string;
  ownerId: string | null;
  currentUserId: string;
  onClose: () => void;
};

export function ShareModal({
  canvasId,
  ownerId,
  currentUserId,
  onClose,
}: ShareModalProps) {
  const [identifier, setIdentifier] = useState("");
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    api
      .listCanvasMembers(canvasId)
      .then((users) => {
        if (active) {
          setMembers(users);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load collaborators");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canvasId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);

    try {
      const user = await api.inviteUser(canvasId, identifier);
      setIdentifier("");
      setMessage(`${user.username} can now open this canvas.`);
      setMembers((currentMembers) => {
        if (currentMembers.some((member) => member.id === user.id)) {
          return currentMembers;
        }
        return [...currentMembers, user].sort((a, b) =>
          a.username.localeCompare(b.username),
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveMember(member: User) {
    setMessage("");
    setError("");
    setRemovingMemberId(member.id);

    try {
      await api.removeCanvasMember(canvasId, member.id);
      setMembers((currentMembers) =>
        currentMembers.filter((currentMember) => currentMember.id !== member.id),
      );
      setMessage(`${member.username} no longer has access.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove access");
    } finally {
      setRemovingMemberId(null);
    }
  }

  function handleOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      aria-labelledby="share-modal-title"
      aria-modal="true"
      className="modal-backdrop"
      onMouseDown={handleOverlayMouseDown}
      role="dialog"
    >
      <section className="share-modal">
        <header className="share-modal-header">
          <div>
            <p className="eyebrow">Sharing</p>
            <h2 id="share-modal-title">Canvas access</h2>
          </div>
          <button aria-label="Close sharing" onClick={onClose} type="button">
            Close
          </button>
        </header>

        <form className="share-invite-form" onSubmit={handleInvite}>
          <label>
            Add people
            <div className="inline-form">
              <input
                autoFocus
                disabled={submitting}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Username or email"
                required
                value={identifier}
              />
              <button className="primary" disabled={submitting} type="submit">
                {submitting ? "Inviting" : "Invite"}
              </button>
            </div>
          </label>
          {message ? <small className="success-text">{message}</small> : null}
          {error ? <small className="error-text">{error}</small> : null}
        </form>

        <div className="member-list">
          <p className="member-list-title">People with access</p>
          {loading ? (
            <p className="muted">Loading collaborators...</p>
          ) : (
            members.map((member) => (
              <MemberRow
                currentUserId={currentUserId}
                isRemoving={removingMemberId === member.id}
                key={member.id}
                member={member}
                onRemove={handleRemoveMember}
                ownerId={ownerId}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

type MemberRowProps = {
  currentUserId: string;
  isRemoving: boolean;
  member: User;
  onRemove: (member: User) => void;
  ownerId: string | null;
};

function MemberRow({
  currentUserId,
  isRemoving,
  member,
  onRemove,
  ownerId,
}: MemberRowProps) {
  const initials = member.username.slice(0, 2).toUpperCase();
  const role = member.id === ownerId ? "Owner" : "Editor";
  const selfLabel = member.id === currentUserId ? "You" : role;
  const canRemove = member.id !== ownerId;

  return (
    <article className="member-row">
      <div className="member-avatar" aria-hidden="true">
        {initials}
      </div>
      <div>
        <strong>{member.username}</strong>
        <span>{member.email}</span>
      </div>
      <p>{selfLabel}</p>
      {canRemove ? (
        <button
          className="text-button danger"
          disabled={isRemoving}
          onClick={() => onRemove(member)}
          type="button"
        >
          {isRemoving ? "Removing" : "Remove"}
        </button>
      ) : null}
    </article>
  );
}
