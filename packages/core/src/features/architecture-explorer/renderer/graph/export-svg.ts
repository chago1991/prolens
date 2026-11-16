/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { nodeSize } from "./layout";

import type { Layout, LayoutDirection } from "./layout";
import type { Health, Provenance } from "./types";
import type { GraphView } from "./views";

export interface ExportPalette {
  readonly background: string;
  readonly surface: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly accent: string;
  readonly health: Readonly<Record<Health, string>>;
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] as string,
  );

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const dash: Record<Provenance, string> = { observed: "", referenced: "6 4", inferred: "2 4" };

const margin = 24;

/**
 * The view as a standalone SVG document, as laid out: groups, edges styled by
 * how they are known, and nodes with their health. Colours are passed in, so
 * that the export follows the active theme.
 */
export const renderSvg = (
  view: GraphView,
  layout: Layout,
  direction: LayoutDirection,
  palette: ExportPalette,
): string => {
  const width = Math.ceil(layout.width + margin * 2);
  const height = Math.ceil(layout.height + margin * 2);
  const parts: string[] = [];
  const point = (id: string) => layout.positions.get(id);

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-margin} ${-margin} ${width} ${height}" font-family="Inter, -apple-system, Segoe UI, sans-serif">`,
    `<rect x="${-margin}" y="${-margin}" width="${width}" height="${height}" fill="${palette.background}"/>`,
  );

  for (const group of layout.groups) {
    parts.push(
      `<g class="group"><rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="14" fill="${palette.surface}" fill-opacity="0.45" stroke="${palette.border}"/>`,
      `<text x="${group.x + 14}" y="${group.y + 22}" font-size="13" font-weight="600" fill="${palette.textMuted}">${escape(group.label)}</text></g>`,
    );
  }

  for (const edge of view.edges) {
    const from = point(edge.source);
    const to = point(edge.target);

    if (!from || !to) continue;

    const [x1, y1, x2, y2] =
      direction === "LR"
        ? [from.x + nodeSize.width, from.y + nodeSize.height / 2, to.x, to.y + nodeSize.height / 2]
        : [from.x + nodeSize.width / 2, from.y + nodeSize.height, to.x + nodeSize.width / 2, to.y];
    const bend = Math.max(40, Math.abs(direction === "LR" ? x2 - x1 : y2 - y1) / 2);
    const path =
      direction === "LR"
        ? `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`
        : `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`;
    const stroke = edge.broken ? palette.health.critical : edge.role ? palette.accent : palette.textMuted;

    parts.push(
      `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${edge.role ? 2 : 1.25}" stroke-opacity="0.8"${dash[edge.provenance] ? ` stroke-dasharray="${dash[edge.provenance]}"` : ""}><title>${escape(`${edge.relation} (${edge.provenance}): ${edge.evidence}`)}</title></path>`,
    );
  }

  for (const node of view.nodes) {
    const position = point(node.id);

    if (!position) continue;

    const { x, y } = position;
    const color = palette.health[node.health];
    const placeholder = node.type === "resource" && node.node.placeholder;
    const subtitle =
      node.type === "resource"
        ? node.node.namespace
          ? `${node.kind} · ${node.node.namespace}`
          : node.kind
        : node.kind;

    parts.push(
      `<g class="node"><rect x="${x}" y="${y}" width="${nodeSize.width}" height="${nodeSize.height}" rx="12" fill="${palette.surface}" stroke="${node.role === "focus" ? palette.accent : palette.border}" stroke-width="${node.role === "focus" ? 2 : 1}"${placeholder ? ' stroke-dasharray="5 4"' : ""}/>`,
      `<rect x="${x}" y="${y + 10}" width="4" height="${nodeSize.height - 20}" rx="2" fill="${color}"/>`,
      `<text x="${x + 16}" y="${y + 28}" font-size="13" font-weight="600" fill="${palette.text}">${escape(truncate(node.label, 28))}</text>`,
      `<text x="${x + 16}" y="${y + 48}" font-size="11" fill="${palette.textMuted}">${escape(truncate(subtitle, 34))}</text>`,
      `<circle cx="${x + nodeSize.width - 16}" cy="${y + 18}" r="5" fill="${color}"><title>${escape(node.health)}</title></circle></g>`,
    );
  }

  parts.push("</svg>");

  return parts.join("\n");
};
