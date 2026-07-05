import type { CanvasDetail, CanvasFolder, CanvasSummary, User } from "./types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
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
  return response;
}

export async function logout(): Promise<void> {
  await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
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

export function listFolders(): Promise<CanvasFolder[]> {
  return request<CanvasFolder[]>("/api/folders");
}

export function createFolder(name: string, parentId: string | null = null): Promise<CanvasFolder> {
  return request<CanvasFolder>("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId }),
  });
}

export function renameFolder(folderId: string, name: string): Promise<CanvasFolder> {
  return request<CanvasFolder>(`/api/folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteFolder(folderId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/folders/${folderId}`, {
    method: "DELETE",
  });
}

export function moveFolder(
  folderId: string,
  parentId: string | null,
): Promise<CanvasFolder> {
  return request<CanvasFolder>(`/api/folders/${folderId}/parent`, {
    method: "PATCH",
    body: JSON.stringify({ parentId }),
  });
}

export function moveCanvasToFolder(
  canvasId: string,
  folderId: string | null,
): Promise<CanvasSummary> {
  return request<CanvasSummary>(`/api/canvases/${canvasId}/folder`, {
    method: "PATCH",
    body: JSON.stringify({ folderId }),
  });
}

export function reorderDashboardItems(
  parentId: string | null,
  items: Array<{ type: "folder" | "canvas"; id: string }>,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/dashboard/order", {
    method: "PATCH",
    body: JSON.stringify({ parentId, items }),
  });
}

export function deleteCanvas(canvasId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/canvases/${canvasId}`, {
    method: "DELETE",
  });
}

export function renameCanvas(canvasId: string, name: string): Promise<CanvasSummary> {
  return request<CanvasSummary>(`/api/canvases/${canvasId}`, {
    method: "PATCH",
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
