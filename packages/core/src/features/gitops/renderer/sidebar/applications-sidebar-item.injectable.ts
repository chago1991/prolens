/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemInjectionToken } from "@freelensapp/cluster-sidebar";
import { getInjectable } from "@ogre-tools/injectable";
import gitOpsSidebarItemInjectable from "../sidebar-item.injectable";
import { gitOpsSectionSidebarItem } from "./gitops-section-sidebar-item";

const gitOpsApplicationsSidebarItemInjectable = getInjectable({
  id: "sidebar-item-gitops-applications",

  instantiate: (di) =>
    gitOpsSectionSidebarItem(di, {
      parentId: gitOpsSidebarItemInjectable.id,
      title: "Applications",
      section: "applications",
      orderNumber: 20,
    }),

  injectionToken: sidebarItemInjectionToken,
});

export default gitOpsApplicationsSidebarItemInjectable;
