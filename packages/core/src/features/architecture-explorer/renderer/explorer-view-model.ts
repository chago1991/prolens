/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, computed, observable } from "mobx";
import { defaultExplorerSettings } from "./explorer-settings.injectable";
import { analyze } from "./graph/analyze";
import { buildArchitectureGraph } from "./graph/build-graph";
import { layoutView } from "./graph/layout";
import { defaultGroupBy, defaultHiddenKinds, defaultViewOptions, selectView } from "./graph/views";

import type { StorageLayer } from "../../../renderer/utils/storage-helper";
import type { ClusterSnapshotSource } from "./cluster-snapshot.injectable";
import type { ExplorerSettings } from "./explorer-settings.injectable";
import type { Analysis } from "./graph/analyze";
import type { Layout, Point } from "./graph/layout";
import type { ArchitectureGraph, GraphEdge, GraphNode } from "./graph/types";
import type { ExplorerMode, GraphView, GroupBy, ViewEdge, ViewNode, ViewOptions } from "./graph/views";

export interface ContextMenuState {
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

/**
 * The state of the explorer page: the graph derived from the cluster's
 * stores, and what the user chose to see. Everything is computed lazily and
 * only while observed.
 */
export class ExplorerViewModel {
  @observable accessor search = "";
  @observable accessor selectedNodeId: string | undefined = undefined;
  @observable accessor selectedEdgeId: string | undefined = undefined;
  @observable accessor contextMenu: ContextMenuState | undefined = undefined;
  @observable accessor highlightImpact = false;

  constructor(
    private readonly source: ClusterSnapshotSource,
    private readonly storage: StorageLayer<ExplorerSettings>,
  ) {}

  /** The stored settings over the defaults, so that settings added later have a value. */
  @computed get settings(): ExplorerSettings {
    return { ...defaultExplorerSettings, ...this.storage.get() };
  }

  @computed get graph(): ArchitectureGraph {
    return buildArchitectureGraph(this.source.snapshot.get());
  }

  @computed get focusNode(): GraphNode | undefined {
    const { focus } = this.settings;

    return focus ? this.graph.nodes.get(focus) : undefined;
  }

  @computed get analysis(): Analysis | undefined {
    const focus = this.focusNode;

    return focus ? analyze(this.graph, focus.id) : undefined;
  }

  @computed get groupBy(): GroupBy {
    const { mode, groupBy } = this.settings;

    return groupBy[mode] ?? defaultGroupBy[mode];
  }

  @computed get hiddenKinds(): Set<string> {
    const { mode, hiddenKinds } = this.settings;
    const hidden = hiddenKinds[mode];

    return hidden ? new Set(hidden) : defaultHiddenKinds(mode);
  }

  @computed get namespace(): string | undefined {
    return this.settings.namespace ?? this.source.namespaces.get()[0];
  }

  @computed get viewOptions(): ViewOptions {
    const settings = this.settings;

    return {
      ...defaultViewOptions,
      mode: settings.mode,
      namespace: this.namespace,
      analysis: settings.mode === "application" ? this.analysis : undefined,
      hiddenKinds: this.hiddenKinds,
      problemsOnly: settings.problemsOnly,
      aggregatePods: settings.aggregatePods,
      hideInactiveReplicaSets: settings.hideInactiveReplicaSets,
      expanded: new Set(settings.expanded),
      collapsedGroups: new Set(settings.collapsedGroups),
      groupBy: this.groupBy,
      search: this.search,
    };
  }

  @computed get view(): GraphView {
    return selectView(this.graph, this.viewOptions);
  }

  /** The key dragged positions are stored under: one per view. */
  @computed get pinKey(): string {
    const { mode, focus } = this.settings;

    return mode === "application"
      ? `${mode}|${focus ?? ""}`
      : mode === "namespace"
        ? `${mode}|${this.namespace ?? ""}`
        : mode;
  }

  @computed get pinned(): Map<string, Point> {
    return new Map(Object.entries(this.settings.pinned[this.pinKey] ?? {}));
  }

  @computed get layout(): Layout {
    return layoutView(this.view, {
      direction: this.settings.direction,
      spacing: this.settings.spacing,
      pinned: this.pinned,
    });
  }

  @computed get selectedViewNode(): ViewNode | undefined {
    return this.view.nodes.find((node) => node.id === this.selectedNodeId);
  }

  @computed get selectedViewEdge(): ViewEdge | undefined {
    return this.view.edges.find((edge) => edge.id === this.selectedEdgeId);
  }

  /** The graph edges at a resource, for the inspector. */
  edgesOf(id: string): { incoming: GraphEdge[]; outgoing: GraphEdge[] } {
    const incoming: GraphEdge[] = [];
    const outgoing: GraphEdge[] = [];

    for (const edge of this.graph.edges) {
      if (edge.target === id) incoming.push(edge);
      if (edge.source === id) outgoing.push(edge);
    }

    return { incoming, outgoing };
  }

  @computed get problemCount(): number {
    let count = 0;

    for (const node of this.view.nodes) {
      if (node.health === "critical" || node.health === "missing" || node.health === "warning") count += 1;
    }

    return count;
  }

  readonly update = action((patch: Partial<ExplorerSettings>) => {
    this.storage.merge(patch);
  });

  readonly setMode = action((mode: ExplorerMode) => {
    this.storage.merge({ mode });
    this.selectedEdgeId = undefined;
  });

  readonly focusOn = action((id: string) => {
    this.storage.merge({ mode: "application", focus: id });
    this.selectedNodeId = id;
    this.selectedEdgeId = undefined;
  });

  readonly select = action((nodeId: string | undefined) => {
    this.selectedNodeId = nodeId;
    this.selectedEdgeId = undefined;
  });

  readonly selectEdge = action((edgeId: string | undefined) => {
    this.selectedEdgeId = edgeId;
  });

  readonly setSearch = action((search: string) => {
    this.search = search;
  });

  readonly toggle = action((key: "expanded" | "collapsedGroups", id: string) => {
    const current = this.settings[key];

    this.storage.merge({ [key]: current.includes(id) ? current.filter((value) => value !== id) : [...current, id] });
  });

  readonly setHiddenKinds = action((kinds: string[]) => {
    this.storage.merge({ hiddenKinds: { ...this.settings.hiddenKinds, [this.settings.mode]: kinds } });
  });

  readonly setGroupBy = action((groupBy: GroupBy) => {
    this.storage.merge({ groupBy: { ...this.settings.groupBy, [this.settings.mode]: groupBy } });
  });

  readonly pin = action((id: string, point: Point) => {
    const pins = this.settings.pinned;

    this.storage.merge({
      pinned: {
        ...pins,
        [this.pinKey]: { ...pins[this.pinKey], [id]: { x: Math.round(point.x), y: Math.round(point.y) } },
      },
    });
  });

  readonly unpin = action((id?: string) => {
    const pins = { ...this.settings.pinned };

    if (id) {
      const { [id]: _removed, ...rest } = pins[this.pinKey] ?? {};

      pins[this.pinKey] = rest;
    } else {
      delete pins[this.pinKey];
    }

    this.storage.merge({ pinned: pins });
  });

  readonly openContextMenu = action((menu: ContextMenuState | undefined) => {
    this.contextMenu = menu;
  });
}
