import type { ActiveUser } from "../types";

const PRESENCE_COLORS = [
  "#e63946",
  "#457b9d",
  "#6a994e",
  "#bc4749",
  "#8f5fbf",
  "#d97706",
  "#0f766e",
  "#be123c",
];

export function getPresenceColor(userId: string): string {
  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) % PRESENCE_COLORS.length;
  }
  return PRESENCE_COLORS[Math.abs(hash)];
}

export function sortActiveUsers(users: ActiveUser[]): ActiveUser[] {
  return [...users].sort((a, b) => a.username.localeCompare(b.username));
}
