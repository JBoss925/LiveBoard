import type { Shape } from "../types";

export function getGroupStack(shape: Shape): string[] {
  if (shape.groupIds?.length) {
    return shape.groupIds;
  }
  return shape.groupId ? [shape.groupId] : [];
}

export function getTopGroupId(shape: Shape): string | null {
  const stack = getGroupStack(shape);
  return stack[stack.length - 1] ?? null;
}

export function isGroupedShape(shape: Shape): boolean {
  return getTopGroupId(shape) !== null;
}

export function addTopGroup(shape: Shape, groupId: string): Shape {
  const groupIds = [...getGroupStack(shape), groupId];
  const next = { ...shape, groupIds, groupId: groupIds[0] ?? null } as Shape;
  return next;
}

export function removeTopGroup(shape: Shape): Shape {
  const groupIds = getGroupStack(shape).slice(0, -1);
  return {
    ...shape,
    groupIds: groupIds.length > 0 ? groupIds : null,
    groupId: groupIds[0] ?? null,
  } as Shape;
}
