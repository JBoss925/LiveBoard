import { FormEvent, useState } from "react";
import * as api from "../api";

type InvitePanelProps = {
  canvasId: string;
};

export function InvitePanel({ canvasId }: InvitePanelProps) {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const user = await api.inviteUser(canvasId, identifier);
      setIdentifier("");
      setMessage(`${user.username} can now open this canvas.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  }

  return (
    <form className="invite-panel" onSubmit={handleInvite}>
      <label>
        Invite by username or email
        <div className="inline-form">
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="teammate@example.com"
            required
          />
          <button type="submit">Invite</button>
        </div>
      </label>
      {message ? <small className="success-text">{message}</small> : null}
      {error ? <small className="error-text">{error}</small> : null}
    </form>
  );
}
