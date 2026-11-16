/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { cssNames } from "@freelensapp/utilities";
import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import styles from "./architecture-explorer.module.scss";
import { kindIcon } from "./kind-icons";

import type { Node, NodeProps } from "@xyflow/react";

import type { LayoutDirection } from "../graph/layout";
import type { Health } from "../graph/types";
import type { ViewNode } from "../graph/views";

export interface ResourceNodeData extends Record<string, unknown> {
  readonly viewNode: ViewNode;
  readonly direction: LayoutDirection;
  readonly dimmed: boolean;
  readonly pinned: boolean;
}

export interface BandNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly problems: number;
  readonly size: number;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}

export type ResourceFlowNode = Node<ResourceNodeData, "resource">;
export type BandFlowNode = Node<BandNodeData, "band">;

const healthClass: Record<Health, string> = {
  healthy: styles.healthy,
  warning: styles.warning,
  critical: styles.critical,
  missing: styles.missing,
  unknown: styles.unknown,
};

const healthLabel: Record<Health, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  missing: "Missing",
  unknown: "Unknown",
};

const healthOrder: Health[] = ["critical", "missing", "warning", "unknown", "healthy"];

const healthColor: Record<Health, string> = {
  healthy: "var(--explorer-healthy)",
  warning: "var(--explorer-warning)",
  critical: "var(--explorer-critical)",
  missing: "var(--explorer-critical)",
  unknown: "var(--explorer-unknown)",
};

const subtitleOf = (viewNode: ViewNode): string => {
  const { node } = viewNode;

  if (viewNode.type === "group") {
    return "Collapsed group";
  }

  if (viewNode.type === "aggregate") {
    return [node.namespace, "aggregated"].filter(Boolean).join(" · ");
  }

  if (node.placeholder === "missing") return `${node.kind} · does not exist`;
  if (node.placeholder === "unverified") return `${node.kind} · not verified`;
  if (node.placeholder === "not-loaded") return `${node.kind} · not loaded`;

  return [node.kind, node.namespace, node.status].filter(Boolean).join(" · ");
};

export const ResourceNode = memo(({ data, selected }: NodeProps<ResourceFlowNode>) => {
  const { viewNode, direction, dimmed, pinned } = data;
  const { node } = viewNode;
  const counts = viewNode.healthCounts;
  const total = viewNode.members?.length ?? 0;
  const warnings = node.warningEvents.reduce((sum, event) => sum + event.count, 0);
  const placeholder = viewNode.type === "resource" && node.placeholder;
  const horizontal = direction === "LR";

  return (
    <div
      className={cssNames(styles.node, healthClass[viewNode.health], {
        [styles.placeholder]: Boolean(placeholder) && viewNode.health !== "missing",
        [styles.selected]: selected,
        [styles.focus]: viewNode.role === "focus",
        [styles.roleImpact]: viewNode.role === "impact",
        [styles.matched]: viewNode.matched,
        [styles.dimmed]: dimmed,
      })}
      data-testid={`explorer-node-${viewNode.id}`}
      title={`${viewNode.kind} ${viewNode.label}: ${healthLabel[viewNode.health]}`}
    >
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        className={styles.handle}
        isConnectable={false}
      />
      <span className={styles.kindIcon} aria-hidden>
        <Icon material={kindIcon(viewNode.kind)} small />
      </span>
      <span className={styles.nodeText}>
        <span className={styles.nodeName}>{viewNode.label}</span>
        <span className={styles.nodeMeta}>{subtitleOf(viewNode)}</span>
        {counts && total > 0 && (
          <span
            className={styles.healthBar}
            aria-label={healthOrder
              .filter((health) => counts[health])
              .map((health) => `${counts[health]} ${health}`)
              .join(", ")}
          >
            {healthOrder.map(
              (health) =>
                counts[health] && (
                  <span
                    key={health}
                    style={{ width: `${((counts[health] ?? 0) / total) * 100}%`, background: healthColor[health] }}
                  />
                ),
            )}
          </span>
        )}
      </span>
      <span className={styles.badges}>
        {pinned && (
          <span className={styles.badge} title="Position pinned">
            <Icon material="push_pin" smallest />
          </span>
        )}
        {warnings > 0 && (
          <span className={cssNames(styles.badge, styles.badgeWarning)} title={`${warnings} warning events`}>
            <Icon material="warning" smallest />
            {warnings > 99 ? "99+" : warnings}
          </span>
        )}
        {viewNode.health === "missing" && <span className={cssNames(styles.badge, styles.badgeCritical)}>missing</span>}
      </span>
      <Handle
        type="source"
        position={horizontal ? Position.Right : Position.Bottom}
        className={styles.handle}
        isConnectable={false}
      />
    </div>
  );
});

ResourceNode.displayName = "ResourceNode";

export const BandNode = memo(({ data }: NodeProps<BandFlowNode>) => (
  <div className={styles.band}>
    <button
      type="button"
      className={styles.bandLabel}
      onClick={data.onToggle}
      aria-expanded={!data.collapsed}
      title={data.collapsed ? "Expand group" : "Collapse group"}
    >
      <Icon material={data.collapsed ? "chevron_right" : "expand_more"} smallest />
      {data.label}
      <span>· {data.size}</span>
      {data.problems > 0 && <span className={cssNames(styles.badge, styles.badgeCritical)}>{data.problems}</span>}
    </button>
  </div>
));

BandNode.displayName = "BandNode";
