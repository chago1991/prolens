/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface TitledItem {
  readonly title: unknown;
  readonly isActive: { get(): boolean };
  readonly children: readonly TitledItem[];
}

/**
 * The title of the deepest active item of a sidebar tree, such as "Pods"
 * rather than "Workloads", or `undefined` when no active item has a text
 * title.
 */
export const activeTitleOf = (items: readonly TitledItem[]): string | undefined => {
  for (const item of items) {
    if (!item.isActive.get()) continue;

    const deeper = activeTitleOf(item.children);

    if (deeper) return deeper;
    if (typeof item.title === "string" && item.title.trim()) return item.title.trim();
  }

  return undefined;
};

/** The label of a cluster tab: "Pods - my-cluster", or the cluster's name alone. */
export const clusterTabLabel = (clusterName: string, viewTitle: string | undefined) =>
  viewTitle ? `${viewTitle} - ${clusterName}` : clusterName;
