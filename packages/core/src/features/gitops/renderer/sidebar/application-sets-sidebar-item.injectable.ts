/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemInjectionToken } from "@freelensapp/cluster-sidebar";
import { getInjectable } from "@ogre-tools/injectable";
import gitOpsSidebarItemInjectable from "../sidebar-item.injectable";
import { gitOpsSectionSidebarItem } from "./gitops-section-sidebar-item";

const gitOpsApplicationSetsSidebarItemInjectable = getInjectable({
  id: "sidebar-item-gitops-application-sets",

  instantiate: (di) =>
    gitOpsSectionSidebarItem(di, {
      parentId: gitOpsSidebarItemInjectable.id,
      title: "Application Sets",
      section: "applicationsets",
      orderNumber: 30,
      tool: "Argo CD",
    }),

  injectionToken: sidebarItemInjectionToken,
});

export default gitOpsApplicationSetsSidebarItemInjectable;
