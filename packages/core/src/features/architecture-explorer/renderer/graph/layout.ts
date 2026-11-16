/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { GraphView } from "./views";

export type LayoutDirection = "LR" | "TB";
export type LayoutSpacing = "compact" | "comfortable";

export interface LayoutOptions {
  readonly direction: LayoutDirection;
  readonly spacing: LayoutSpacing;
  /** Positions the user dragged nodes to, which the layout keeps. */
  readonly pinned?: ReadonlyMap<string, Point>;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface GroupBox {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Layout {
  readonly positions: ReadonlyMap<string, Point>;
  readonly groups: readonly GroupBox[];
  readonly width: number;
  readonly height: number;
}

export const nodeSize = { width: 232, height: 68 };

const spacingOf = (spacing: LayoutSpacing) =>
  spacing === "compact"
    ? { column: 64, row: 12, group: 40, header: 34, padding: 16 }
    : { column: 110, row: 22, group: 64, header: 40, padding: 24 };

/** Nodes per column before a column wraps into another one. */
const maxPerColumn = 24;

/**
 * Columns by kind, in the direction traffic and dependencies flow, and one
 * band per group. Within a column, nodes are ordered by the mean position of
 * their neighbours (barycentre), which keeps most edges short and uncrossed.
 * Columns line up across bands. Linear in nodes and edges per pass.
 */
export const layoutView = (view: GraphView, options: LayoutOptions): Layout => {
  const space = spacingOf(options.spacing);
  const horizontal = options.direction === "LR";
  // Along the flow, a column is as wide as a node in LR and as tall in TB.
  const columnExtent = horizontal ? nodeSize.width : nodeSize.height;
  const rowExtent = horizontal ? nodeSize.height : nodeSize.width;

  const neighbours = new Map<string, string[]>();

  for (const edge of view.edges) {
    for (const [a, b] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      const list = neighbours.get(a);

      if (list) {
        list.push(b);
      } else {
        neighbours.set(a, [b]);
      }
    }
  }

  const tiers = [...new Set(view.nodes.map((node) => node.tier))].sort((a, b) => a - b);
  const byGroup = new Map<string, Map<number, string[]>>();

  for (const node of view.nodes) {
    let columns = byGroup.get(node.group);

    if (!columns) {
      columns = new Map();
      byGroup.set(node.group, columns);
    }

    const column = columns.get(node.tier);

    if (column) {
      column.push(node.id);
    } else {
      columns.set(node.tier, [node.id]);
    }
  }

  const label = new Map(view.nodes.map((node) => [node.id, `${node.kind}/${node.label}`]));

  // Order within each column of each group.
  const order = new Map<string, number>();

  for (const columns of byGroup.values()) {
    for (const column of columns.values()) {
      column.sort((a, b) => (label.get(a) ?? a).localeCompare(label.get(b) ?? b));
      column.forEach((id, index) => order.set(id, index));
    }

    const tiersInGroup = [...columns.keys()].sort((a, b) => a - b);
    const tierOfNode = new Map<string, number>();

    for (const [tier, column] of columns) {
      for (const id of column) tierOfNode.set(id, tier);
    }

    for (let pass = 0; pass < 4; pass += 1) {
      const forward = pass % 2 === 0;
      const sequence = forward ? tiersInGroup : [...tiersInGroup].reverse();

      for (const tier of sequence) {
        const column = columns.get(tier) as string[];
        const weight = new Map<string, number>();

        for (const id of column) {
          const placed = (neighbours.get(id) ?? []).filter((other) => {
            const otherTier = tierOfNode.get(other);

            return otherTier !== undefined && (forward ? otherTier < tier : otherTier > tier);
          });

          weight.set(
            id,
            placed.length
              ? placed.reduce((sum, other) => sum + (order.get(other) ?? 0), 0) / placed.length
              : (order.get(id) ?? 0),
          );
        }

        column.sort(
          (a, b) => (weight.get(a) ?? 0) - (weight.get(b) ?? 0) || (label.get(a) ?? a).localeCompare(label.get(b) ?? b),
        );
        column.forEach((id, index) => order.set(id, index));
      }
    }
  }

  // A column wraps into sub-columns when it is long; columns line up across groups.
  const subColumns = new Map<number, number>();

  for (const columns of byGroup.values()) {
    for (const [tier, column] of columns) {
      subColumns.set(tier, Math.max(subColumns.get(tier) ?? 1, Math.ceil(column.length / maxPerColumn)));
    }
  }

  const columnOffset = new Map<number, number>();
  let offset = space.padding;

  for (const tier of tiers) {
    columnOffset.set(tier, offset);
    offset += (subColumns.get(tier) ?? 1) * (columnExtent + space.column / 2) + space.column / 2;
  }

  const flowLength = offset - space.column + space.padding;
  const positions = new Map<string, Point>();
  const groups = [];
  const groupOrder = [...view.groups.map((group) => group.id)];

  for (const id of byGroup.keys()) {
    if (!groupOrder.includes(id)) groupOrder.push(id);
  }

  let crossOffset = 0;

  for (const groupId of groupOrder) {
    const columns = byGroup.get(groupId);

    if (!columns) continue;

    const header = groupId ? space.header : 0;
    let rows = 0;

    for (const [tier, column] of columns) {
      const wraps = subColumns.get(tier) ?? 1;
      const perColumn = Math.ceil(column.length / wraps);

      rows = Math.max(rows, perColumn);

      column.forEach((id, index) => {
        const sub = Math.floor(index / perColumn);
        const row = index % perColumn;
        const along = (columnOffset.get(tier) ?? 0) + sub * (columnExtent + space.column / 2);
        const across = crossOffset + header + space.padding + row * (rowExtent + space.row);

        positions.set(id, horizontal ? { x: along, y: across } : { x: across, y: along });
      });
    }

    const bandExtent = header + space.padding * 2 + rows * (rowExtent + space.row) - space.row;

    if (groupId) {
      const group = view.groups.find((candidate) => candidate.id === groupId);

      groups.push(
        horizontal
          ? { id: groupId, label: group?.label ?? groupId, x: 0, y: crossOffset, width: flowLength, height: bandExtent }
          : {
              id: groupId,
              label: group?.label ?? groupId,
              x: crossOffset,
              y: 0,
              width: bandExtent,
              height: flowLength,
            },
      );
    }

    crossOffset += bandExtent + space.group;
  }

  for (const [id, point] of options.pinned ?? []) {
    if (positions.has(id)) positions.set(id, point);
  }

  const crossLength = Math.max(0, crossOffset - space.group);

  return {
    positions,
    groups,
    width: horizontal ? flowLength : crossLength,
    height: horizontal ? crossLength : flowLength,
  };
};
