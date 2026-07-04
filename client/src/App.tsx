import { useEffect, useState } from "react";
import * as api from "./api";
import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./components/Dashboard";
import { LoadingState } from "./components/LoadingState";
import { Whiteboard } from "./components/Whiteboard";
import type { User } from "./types";

type Screen =
  | { name: "loading" }
  | { name: "auth" }
  | { name: "dashboard" }
  | { name: "canvas"; canvasId: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api
      .getMe()
      .then((currentUser) => {
        setUser(currentUser);
        setScreen({ name: "dashboard" });
      })
      .catch(() => {
        setScreen({ name: "auth" });
      });
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setScreen({ name: "auth" });
  }

  if (screen.name === "loading") {
    return (
      <main className="loading-screen">
        <LoadingState
          fullScreen
          title="Opening workspace"
          message="Checking your session before loading your canvases."
        />
      </main>
    );
  }

  if (screen.name === "auth" || !user) {
    return (
      <AuthScreen
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          setScreen({ name: "dashboard" });
        }}
      />
    );
  }

  if (screen.name === "canvas") {
    return (
      <Whiteboard
        canvasId={screen.canvasId}
        token={null}
        user={user}
        onBack={() => setScreen({ name: "dashboard" })}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      onLogout={() => void handleLogout()}
      onOpenCanvas={(canvasId) => setScreen({ name: "canvas", canvasId })}
    />
  );
}
