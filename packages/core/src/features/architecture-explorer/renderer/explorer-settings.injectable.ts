/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import createStorageInjectable from "../../../renderer/utils/create-storage/create-storage.injectable";

import type { LayoutDirection, LayoutSpacing, Point } from "./graph/layout";
import type { ExplorerMode, GroupBy } from "./graph/views";

/**
 * What the explorer remembers. The storage is per cluster, so that a layout
 * or focus of one cluster never shows up in another.
 */
export interface ExplorerSettings {
  readonly mode: ExplorerMode;
  /** The resource the dependency view starts from, by graph node id. */
  readonly focus?: string;
  readonly namespace?: string;
  readonly groupBy: Partial<Record<ExplorerMode, GroupBy>>;
  /** Kinds hidden per mode; a mode without an entry uses its defaults. */
  readonly hiddenKinds: Partial<Record<ExplorerMode, string[]>>;
  readonly direction: LayoutDirection;
  readonly spacing: LayoutSpacing;
  readonly problemsOnly: boolean;
  readonly aggregatePods: boolean;
  readonly hideInactiveReplicaSets: boolean;
  readonly collapsedGroups: string[];
  readonly expanded: string[];
  /** Dragged node positions, per view (mode and focus or namespace). */
  readonly pinned: Record<string, Record<string, Point>>;
  readonly showMinimap: boolean;
  readonly showLegend: boolean;
}

export const defaultExplorerSettings: ExplorerSettings = {
  mode: "cluster",
  groupBy: {},
  hiddenKinds: {},
  direction: "LR",
  spacing: "comfortable",
  problemsOnly: false,
  aggregatePods: true,
  hideInactiveReplicaSets: true,
  collapsedGroups: [],
  expanded: [],
  pinned: {},
  showMinimap: true,
  showLegend: false,
};

const explorerSettingsInjectable = getInjectable({
  id: "architecture-explorer-settings",

  instantiate: (di) =>
    di.inject(createStorageInjectable)<ExplorerSettings>("architecture_explorer", defaultExplorerSettings),
});

export default explorerSettingsInjectable;
