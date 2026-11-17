/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemInjectionToken } from "@freelensapp/cluster-sidebar";
import { getInjectable } from "@ogre-tools/injectable";
import { gitOpsSectionSidebarItem } from "./gitops-section-sidebar-item";
import gitOpsSettingsSidebarItemInjectable from "./settings-sidebar-item.injectable";

const gitOpsClustersSidebarItemInjectable = getInjectable({
  id: "sidebar-item-gitops-clusters",

  instantiate: (di) =>
    gitOpsSectionSidebarItem(di, {
      parentId: gitOpsSettingsSidebarItemInjectable.id,
      title: "Clusters",
      section: "clusters",
      orderNumber: 20,
      tool: "Argo CD",
    }),

  injectionToken: sidebarItemInjectionToken,
});

export default gitOpsClustersSidebarItemInjectable;
