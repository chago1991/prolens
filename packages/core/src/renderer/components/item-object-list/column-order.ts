/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * The order to show the columns in: the saved order of the columns that
 * still exist, with the columns it does not know (new ones, or ones an
 * extension added) placed after the column that precedes them by default.
 */
export const effectiveColumnOrder = (saved: readonly string[] | undefined, defaults: readonly string[]): string[] => {
  const known = new Set(defaults);
  const order = (saved ?? []).filter((id, index, all) => known.has(id) && all.indexOf(id) === index);

  defaults.forEach((id, index) => {
    if (order.includes(id)) return;

    const previous = defaults
      .slice(0, index)
      .reverse()
      .find((candidate) => order.includes(candidate));

    order.splice(previous === undefined ? 0 : order.indexOf(previous) + 1, 0, id);
  });

  return order;
};

/** Moves `columnId` next to `targetId`, before or after it. */
export const moveColumn = (
  order: readonly string[],
  columnId: string,
  targetId: string,
  placement: "before" | "after",
): string[] => {
  if (columnId === targetId || !order.includes(columnId) || !order.includes(targetId)) return [...order];

  const result = order.filter((id) => id !== columnId);
  const at = result.indexOf(targetId) + (placement === "after" ? 1 : 0);

  result.splice(at, 0, columnId);

  return result;
};

/** Whether the order differs from the default one. */
export const isCustomColumnOrder = (order: readonly string[], defaults: readonly string[]) =>
  order.length !== defaults.length || order.some((id, index) => id !== defaults[index]);
