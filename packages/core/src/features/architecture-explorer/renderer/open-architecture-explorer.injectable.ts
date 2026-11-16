/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import navigateToArchitectureExplorerInjectable from "../common/navigate-to-architecture-explorer.injectable";
import explorerSettingsInjectable from "./explorer-settings.injectable";
import { groupOf, nodeId } from "./graph/build-graph";

export interface ExplorerTarget {
  readonly kind: string;
  readonly apiVersion: string;
  readonly name: string;
  readonly namespace?: string;
}

export type OpenArchitectureExplorer = (target: ExplorerTarget) => void;

/** Opens the dependency view of a resource. */
const openArchitectureExplorerInjectable = getInjectable({
  id: "open-architecture-explorer",

  // Injected on use: every resource menu has this item, and most are never clicked.
  instantiate:
    (di): OpenArchitectureExplorer =>
    ({ kind, apiVersion, name, namespace }) => {
      di.inject(explorerSettingsInjectable).merge({
        mode: "application",
        focus: nodeId(groupOf(apiVersion), kind, namespace, name),
      });
      di.inject(navigateToArchitectureExplorerInjectable)();
    },
});

export default openArchitectureExplorerInjectable;
