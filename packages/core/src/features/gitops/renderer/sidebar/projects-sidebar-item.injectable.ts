/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemInjectionToken } from "@freelensapp/cluster-sidebar";
import { getInjectable } from "@ogre-tools/injectable";
import gitOpsSidebarItemInjectable from "../sidebar-item.injectable";
import { gitOpsSectionSidebarItem } from "./gitops-section-sidebar-item";

const gitOpsProjectsSidebarItemInjectable = getInjectable({
  id: "sidebar-item-gitops-projects",

  instantiate: (di) =>
    gitOpsSectionSidebarItem(di, {
      parentId: gitOpsSidebarItemInjectable.id,
      title: "Projects",
      section: "projects",
      orderNumber: 40,
      tool: "Argo CD",
    }),

  injectionToken: sidebarItemInjectionToken,
});

export default gitOpsProjectsSidebarItemInjectable;
