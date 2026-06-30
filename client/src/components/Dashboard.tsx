import { FormEvent, useEffect, useState } from "react";
import * as api from "../api";
import type { CanvasSummary, User } from "../types";
import { CanvasList, CanvasListLoading } from "./CanvasList";

type DashboardProps = {
  user: User;
  onLogout: () => void;
  onOpenCanvas: (canvasId: string) => void;
};

export function Dashboard({ user, onLogout, onOpenCanvas }: DashboardProps) {
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [name, setName] = useState("Design Review");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function loadCanvases() {
    setError("");
    setLoading(true);
    try {
      setCanvases(await api.listCanvases());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load canvases");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCanvases();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    setCreating(true);
    setError("");
    try {
      const canvas = await api.createCanvas(name.trim());
      setCanvases((current) => [canvas, ...current]);
      setName("");
      onOpenCanvas(canvas.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create canvas");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Canvases</h1>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">{user.username}</span>
          <button onClick={onLogout} type="button">
            Log out
          </button>
        </div>
      </header>

      <section className="dashboard-grid">
        <form className="create-panel" onSubmit={handleCreate}>
          <h2>Create canvas</h2>
          <label>
            Canvas name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Design Review"
              required
            />
          </label>
          <button className="primary" disabled={creating} type="submit">
            {creating ? "Creating..." : "Create and open"}
          </button>
        </form>

        <section className="list-panel">
          <div className="section-heading">
            <h2>Your canvases</h2>
            <button onClick={() => void loadCanvases()} type="button">
              Refresh
            </button>
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          {loading ? <CanvasListLoading /> : null}
          {!loading ? <CanvasList canvases={canvases} onOpen={onOpenCanvas} /> : null}
        </section>
      </section>
    </main>
  );
}
