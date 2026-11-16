/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { cssNames } from "@freelensapp/utilities";
import { observer } from "mobx-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { healthRank, isProblem } from "../graph/health";
import styles from "./architecture-explorer.module.scss";
import { useExplorer } from "./explorer-context";
import { provenanceMeaning } from "./explorer-inspector";
import { kindIcon } from "./kind-icons";

import type { ClusterSnapshotSource } from "../cluster-snapshot.injectable";
import type { GraphNode, Health } from "../graph/types";

export const StatusBar = observer(({ source }: { source: ClusterSnapshotSource }) => {
  const { vm } = useExplorer();
  const { view } = vm;
  const unavailable = source.unavailableKinds.get();
  const interrupted = source.interrupted.get();
  const loading = source.loading.get();

  return (
    <div className={styles.statusBar} role="status" data-testid="explorer-status">
      <span className={cssNames(styles.live, { [styles.reconnecting]: interrupted || loading })}>
        {loading ? "Loading…" : interrupted ? "Reconnecting: data may be out of date" : "Live"}
      </span>
      <span>
        {view.nodes.length} nodes · {view.edges.length} relationships
      </span>
      {vm.problemCount > 0 && <span className={styles.notice}>{vm.problemCount} with problems</span>}
      {view.truncated > 0 && (
        <span className={styles.notice}>
          Showing {view.nodes.length} of {view.total}: narrow the view with a namespace, filters or the dependency view
        </span>
      )}
      {unavailable.length > 0 && (
        <span title="These kinds could not be listed: references to them are shown as not verified">
          Not available: {unavailable.join(", ")}
        </span>
      )}
    </div>
  );
});

const LegendLine = ({ dash, color = "var(--textColorTertiary)" }: { dash?: string; color?: string }) => (
  <svg width="36" height="8" aria-hidden>
    <line x1="0" y1="4" x2="36" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} />
  </svg>
);

const healthLegend: [Health, string][] = [
  ["healthy", "Healthy"],
  ["warning", "Warning"],
  ["critical", "Critical"],
  ["missing", "Missing (dashed outline)"],
  ["unknown", "Unknown or not verified"],
];

export const Legend = () => (
  <div className={styles.legend} aria-label="Legend">
    <span title={provenanceMeaning.observed}>
      <LegendLine /> Observed
    </span>
    <span title={provenanceMeaning.referenced}>
      <LegendLine dash="6 4" /> Referenced
    </span>
    <span title={provenanceMeaning.inferred}>
      <LegendLine dash="2 4" /> Inferred
    </span>
    <span>
      <LegendLine color="var(--colorError)" /> Broken
    </span>
    <span>
      <LegendLine color="var(--primary)" /> Dependency of the focus
    </span>
    <span>
      <LegendLine color="var(--explorer-impact)" /> Affected by the focus
    </span>
    {healthLegend.map(([health, label]) => (
      <span key={health} className={styles[health]}>
        <span className={styles.dot} /> {label}
      </span>
    ))}
  </div>
);

export const ContextMenu = observer(() => {
  const { vm, actions } = useExplorer();
  const menu = vm.contextMenu;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return undefined;

    ref.current?.querySelector("button")?.focus();

    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) {
        vm.openContextMenu(undefined);
      }
    };

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);

    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu, vm]);

  if (!menu) return null;

  const viewNode = vm.view.nodes.find((node) => node.id === menu.nodeId);

  if (!viewNode) return null;

  const node = viewNode.type === "resource" ? viewNode.node : undefined;
  const run = (action: () => void) => () => {
    vm.openContextMenu(undefined);
    action();
  };
  const pinned = vm.pinned.has(viewNode.id);

  return (
    <div
      className={styles.contextMenu}
      ref={ref}
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      data-testid="explorer-context-menu"
    >
      <button type="button" role="menuitem" onClick={run(() => vm.select(viewNode.id))}>
        <Icon material="info" smallest /> Inspect
      </button>
      {node?.selfLink && !node.placeholder && (
        <button type="button" role="menuitem" onClick={run(() => actions.openDetails(node.selfLink as string))}>
          <Icon material="open_in_new" smallest /> Details, events, YAML
        </button>
      )}
      {node && (
        <button type="button" role="menuitem" onClick={run(() => vm.focusOn(node.id))}>
          <Icon material="hub" smallest /> Explore dependencies
        </button>
      )}
      {viewNode.type === "aggregate" && (
        <button type="button" role="menuitem" onClick={run(() => vm.toggle("expanded", viewNode.id))}>
          <Icon material="unfold_more" smallest /> Show each pod
        </button>
      )}
      {viewNode.type === "resource" && viewNode.node.kind === "Pod" && vm.settings.expanded.length > 0 && (
        <button type="button" role="menuitem" onClick={run(() => vm.update({ expanded: [] }))}>
          <Icon material="unfold_less" smallest /> Group pods again
        </button>
      )}
      {viewNode.group && (
        <button type="button" role="menuitem" onClick={run(() => vm.toggle("collapsedGroups", viewNode.group))}>
          <Icon material={viewNode.type === "group" ? "unfold_more" : "unfold_less"} smallest />
          {viewNode.type === "group" ? "Expand" : "Collapse"} {viewNode.group}
        </button>
      )}
      <hr />
      {viewNode.type !== "group" && (
        <button
          type="button"
          role="menuitem"
          onClick={run(() => vm.setHiddenKinds([...vm.hiddenKinds, viewNode.kind]))}
        >
          <Icon material="visibility_off" smallest /> Hide every {viewNode.kind}
        </button>
      )}
      {pinned && (
        <button type="button" role="menuitem" onClick={run(() => vm.unpin(viewNode.id))}>
          <Icon material="push_pin" smallest /> Return to its place
        </button>
      )}
      <button type="button" role="menuitem" onClick={run(() => navigator.clipboard?.writeText(viewNode.label))}>
        <Icon material="content_copy" smallest /> Copy name
      </button>
    </div>
  );
});

/** Top-level kinds a troubleshooting session usually starts from. */
const entryKinds = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "CronJob",
  "Job",
  "Service",
  "Ingress",
  "Gateway",
  "HTTPRoute",
  "GRPCRoute",
  "PersistentVolumeClaim",
  "Node",
  "Pod",
]);

/** Chooses the resource the dependency view starts from, problems first. */
export const FocusPicker = observer(() => {
  const { vm } = useExplorer();
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all: GraphNode[] = [];

    for (const node of vm.graph.nodes.values()) {
      if (node.placeholder || !entryKinds.has(node.kind)) continue;
      if (!terms.length && !isProblem(node.health)) continue;

      const text = `${node.kind} ${node.namespace ?? ""} ${node.name}`.toLowerCase();

      if (terms.every((term) => text.includes(term))) all.push(node);
    }

    return all
      .sort(
        (a, b) =>
          healthRank(b.health) - healthRank(a.health) ||
          Number(b.kind !== "Pod") - Number(a.kind !== "Pod") ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 60);
  }, [query, vm.graph]);

  return (
    <div className={styles.empty}>
      <div className={styles.emptyCard} data-testid="explorer-focus-picker">
        <h3>What should ProLens explain?</h3>
        <p>
          Pick a resource. ProLens shows what it depends on, what depends on it, and where along the way problems start,
          with the evidence for each link.
        </p>
        <label className={styles.search}>
          <Icon material="search" smallest />
          <input
            autoFocus
            type="search"
            placeholder="Search a workload, Service, Ingress, claim or node"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search a resource"
          />
        </label>
        {!query && (
          <h4 style={{ margin: 0 }}>
            {candidates.length ? "Resources with problems" : "No resource has a problem right now"}
          </h4>
        )}
        <ul className={styles.pickList}>
          {candidates.map((node) => (
            <li key={node.id}>
              <button type="button" onClick={() => vm.focusOn(node.id)} className={styles[node.health]}>
                <span className={styles.dot} />
                <Icon material={kindIcon(node.kind)} smallest />
                <span>
                  {node.name}
                  {node.reasons[0] && <span className={styles.nodeMeta}> — {node.reasons[0]}</span>}
                </span>
                <small>
                  {node.kind}
                  {node.namespace ? ` · ${node.namespace}` : ""}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
});

export const EmptyView = ({ loading }: { loading: boolean }) => (
  <div className={styles.empty}>
    <div className={styles.emptyCard}>
      <h3>{loading ? "Loading the cluster's resources…" : "Nothing to show"}</h3>
      {!loading && <p>No resource matches this view. Choose another view or namespace, or change the filters.</p>}
    </div>
  </div>
);
