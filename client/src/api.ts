import type { CanvasDetail, CanvasSummary, User } from "./types";

const TOKEN_KEY = "whiteboard.sessionToken";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = "Request failed";
    try {
      const body = (await response.json()) as { detail?: unknown };
      message = formatApiError(body.detail) ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function formatApiError(detail: unknown): string | null {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (isValidationItem(item)) {
          const location =
            Array.isArray(item.loc)
              ? item.loc.filter((part: unknown) => part !== "body").join(".")
              : "";
          return location ? `${location}: ${item.msg}` : item.msg;
        }
        return String(item);
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }
  return null;
}

function isValidationItem(item: unknown): item is { msg: string; loc?: unknown[] } {
  return Boolean(
    item &&
      typeof item === "object" &&
      "msg" in item &&
      typeof item.msg === "string",
  );
}

type AuthResponse = {
  token: string;
  user: User;
};

export async function signup(
  username: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
  setToken(response.token);
  return response;
}

export async function login(
  identifier: string,
  password: string,
): Promise<AuthResponse> {
  const response = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  setToken(response.token);
  return response;
}

export async function logout(): Promise<void> {
  try {
    await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  } finally {
    setToken(null);
  }
}

export function getMe(): Promise<User> {
  return request<User>("/api/me");
}

export function listCanvases(): Promise<CanvasSummary[]> {
  return request<CanvasSummary[]>("/api/canvases");
}

export function createCanvas(name: string): Promise<CanvasSummary> {
  return request<CanvasSummary>("/api/canvases", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function getCanvas(canvasId: string): Promise<CanvasDetail> {
  return request<CanvasDetail>(`/api/canvases/${canvasId}`);
}

export async function listCanvasMembers(canvasId: string): Promise<User[]> {
  const response = await request<{ users: User[] }>(
    `/api/canvases/${canvasId}/members`,
  );
  return response.users;
}

export async function inviteUser(
  canvasId: string,
  identifier: string,
): Promise<User> {
  const response = await request<{ user: User }>(
    `/api/canvases/${canvasId}/invite`,
    {
      method: "POST",
      body: JSON.stringify({ identifier }),
    },
  );
  return response.user;
}

export function removeCanvasMember(
  canvasId: string,
  memberId: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/canvases/${canvasId}/members/${memberId}`,
    { method: "DELETE" },
  );
}
