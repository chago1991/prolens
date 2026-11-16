/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { observer } from "mobx-react";
import React, { useEffect, useRef, useState } from "react";
import { explorerModes, kindsOfMode } from "../graph/views";
import styles from "./architecture-explorer.module.scss";
import { useExplorer } from "./explorer-context";

import type { GroupBy } from "../graph/views";

const allKinds = [
  "GatewayClass",
  "Gateway",
  "HTTPRoute",
  "GRPCRoute",
  "IngressClass",
  "Ingress",
  "Service",
  "EndpointSlice",
  "NetworkPolicy",
  "CiliumNetworkPolicy",
  "CronJob",
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "Job",
  "ReplicaSet",
  "Pod",
  "ConfigMap",
  "Secret",
  "ServiceAccount",
  "PersistentVolumeClaim",
  "PersistentVolume",
  "StorageClass",
  "Node",
];

type Panel = "filters" | "layout" | "export";

export interface ExplorerToolbarProps {
  readonly namespaces: readonly string[];
  readonly onExport: (format: "svg" | "png") => void;
  readonly searchRef: React.RefObject<HTMLInputElement | null>;
}

export const ExplorerToolbar = observer(({ namespaces, onExport, searchRef }: ExplorerToolbarProps) => {
  const { vm, actions } = useExplorer();
  const [panel, setPanel] = useState<Panel | undefined>(undefined);
  const toolbar = useRef<HTMLDivElement>(null);
  const { settings } = vm;
  const modeKinds = kindsOfMode(settings.mode);
  const kinds = allKinds.filter((kind) => !modeKinds || modeKinds.has(kind));
  const hidden = vm.hiddenKinds;
  const matches = vm.view.matches;

  useEffect(() => {
    if (!panel) return undefined;

    const close = (event: MouseEvent) => {
      if (!toolbar.current?.contains(event.target as Node)) setPanel(undefined);
    };

    document.addEventListener("mousedown", close);

    return () => document.removeEventListener("mousedown", close);
  }, [panel]);

  const toggle = (next: Panel) => setPanel((current) => (current === next ? undefined : next));

  return (
    <div className={styles.toolbar} ref={toolbar} role="toolbar" aria-label="Architecture explorer">
      <div className={styles.segmented} role="group" aria-label="View">
        {explorerModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            aria-pressed={settings.mode === mode.id}
            title={mode.description}
            onClick={() => vm.setMode(mode.id)}
            data-testid={`explorer-mode-${mode.id}`}
          >
            {mode.title}
          </button>
        ))}
      </div>

      {settings.mode === "application" && vm.focusNode && (
        <span className={styles.focusChip} title="The resource the dependency view starts from">
          <Icon material="my_location" smallest />
          <span>
            {vm.focusNode.kind} {vm.focusNode.name}
          </span>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => vm.update({ focus: undefined })}
            aria-label="Choose another resource"
            title="Choose another resource"
          >
            <Icon material="close" smallest />
          </button>
        </span>
      )}

      {settings.mode === "namespace" && (
        <select
          className={styles.select}
          aria-label="Namespace"
          value={vm.namespace ?? ""}
          onChange={(event) => vm.update({ namespace: event.target.value })}
        >
          {namespaces.map((namespace) => (
            <option key={namespace} value={namespace}>
              {namespace}
            </option>
          ))}
        </select>
      )}

      <span className={styles.spacer} />

      <label className={styles.search}>
        <Icon material="search" smallest />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search name, kind or label=value"
          value={vm.search}
          onChange={(event) => vm.setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches.length) {
              const index = (matches.indexOf(vm.selectedNodeId ?? "") + 1) % matches.length;

              vm.select(matches[index]);
              actions.centerOn(matches[index]);
            }

            if (event.key === "Escape") vm.setSearch("");
          }}
          aria-label="Search the graph"
          data-testid="explorer-search"
        />
        {vm.search && <small>{matches.length} found</small>}
      </label>

      <button
        type="button"
        className={styles.toolButton}
        aria-pressed={settings.problemsOnly}
        onClick={() => vm.update({ problemsOnly: !settings.problemsOnly })}
        title="Show only problems and what they touch"
      >
        <Icon material="report" smallest />
        Problems{vm.problemCount ? ` (${vm.problemCount})` : ""}
      </button>

      <button
        type="button"
        className={styles.toolButton}
        aria-expanded={panel === "filters"}
        onClick={() => toggle("filters")}
      >
        <Icon material="filter_list" smallest />
        Filters
      </button>
      <button
        type="button"
        className={styles.toolButton}
        aria-expanded={panel === "layout"}
        onClick={() => toggle("layout")}
      >
        <Icon material="account_tree" smallest />
        Layout
      </button>
      <button
        type="button"
        className={styles.toolButton}
        aria-expanded={panel === "export"}
        onClick={() => toggle("export")}
      >
        <Icon material="ios_share" smallest />
        Export
      </button>
      <button
        type="button"
        className={styles.toolButton}
        onClick={actions.fitView}
        title="Fit to screen (F)"
        aria-label="Fit to screen"
      >
        <Icon material="fit_screen" smallest />
      </button>
      <button
        type="button"
        className={styles.toolButton}
        aria-pressed={settings.showLegend}
        onClick={() => vm.update({ showLegend: !settings.showLegend })}
        title="Legend"
        aria-label="Legend"
      >
        <Icon material="help_outline" smallest />
      </button>

      {panel === "filters" && (
        <div className={styles.popover} role="dialog" aria-label="Filters">
          <h4>Kinds</h4>
          <div className={styles.kindGrid}>
            {kinds.map((kind) => (
              <label key={kind}>
                <input
                  type="checkbox"
                  checked={!hidden.has(kind)}
                  onChange={() =>
                    vm.setHiddenKinds(
                      hidden.has(kind) ? [...hidden].filter((value) => value !== kind) : [...hidden, kind],
                    )
                  }
                />
                {kind}
              </label>
            ))}
          </div>
          <h4>Resources</h4>
          <label>
            <input
              type="checkbox"
              checked={settings.aggregatePods}
              onChange={() => vm.update({ aggregatePods: !settings.aggregatePods })}
            />
            Group the pods of a workload
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.hideInactiveReplicaSets}
              onChange={() => vm.update({ hideInactiveReplicaSets: !settings.hideInactiveReplicaSets })}
            />
            Hide ReplicaSets of old revisions
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.problemsOnly}
              onChange={() => vm.update({ problemsOnly: !settings.problemsOnly })}
            />
            Only problems and their neighbours
          </label>
        </div>
      )}

      {panel === "layout" && (
        <div className={styles.popover} role="dialog" aria-label="Layout">
          <h4>Direction</h4>
          <div className={styles.segmented} role="group" aria-label="Direction">
            <button
              type="button"
              aria-pressed={settings.direction === "LR"}
              onClick={() => vm.update({ direction: "LR" })}
            >
              Left to right
            </button>
            <button
              type="button"
              aria-pressed={settings.direction === "TB"}
              onClick={() => vm.update({ direction: "TB" })}
            >
              Top to bottom
            </button>
          </div>
          <h4>Group by</h4>
          <div className={styles.segmented} role="group" aria-label="Group by">
            {(["namespace", "node", "none"] as GroupBy[]).map((groupBy) => (
              <button
                key={groupBy}
                type="button"
                aria-pressed={vm.groupBy === groupBy}
                onClick={() => vm.setGroupBy(groupBy)}
              >
                {groupBy === "none" ? "Nothing" : groupBy === "node" ? "Node" : "Namespace"}
              </button>
            ))}
          </div>
          <h4>Spacing</h4>
          <div className={styles.segmented} role="group" aria-label="Spacing">
            <button
              type="button"
              aria-pressed={settings.spacing === "compact"}
              onClick={() => vm.update({ spacing: "compact" })}
            >
              Compact
            </button>
            <button
              type="button"
              aria-pressed={settings.spacing === "comfortable"}
              onClick={() => vm.update({ spacing: "comfortable" })}
            >
              Comfortable
            </button>
          </div>
          <label>
            <input
              type="checkbox"
              checked={settings.showMinimap}
              onChange={() => vm.update({ showMinimap: !settings.showMinimap })}
            />
            Show the minimap
          </label>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => vm.unpin()}
            disabled={vm.pinned.size === 0}
          >
            <Icon material="restart_alt" smallest />
            Reset dragged positions ({vm.pinned.size})
          </button>
          {settings.collapsedGroups.length > 0 && (
            <button type="button" className={styles.toolButton} onClick={() => vm.update({ collapsedGroups: [] })}>
              <Icon material="unfold_more" smallest />
              Expand all groups
            </button>
          )}
        </div>
      )}

      {panel === "export" && (
        <div className={styles.popover} role="dialog" aria-label="Export">
          <h4>Export the current view</h4>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => {
              setPanel(undefined);
              onExport("svg");
            }}
          >
            <Icon material="polyline" smallest />
            SVG (vector)
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => {
              setPanel(undefined);
              onExport("png");
            }}
          >
            <Icon material="image" smallest />
            PNG (image)
          </button>
        </div>
      )}
    </div>
  );
});
