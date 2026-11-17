/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemInjectionToken } from "@freelensapp/cluster-sidebar";
import { getInjectable } from "@ogre-tools/injectable";
import { gitOpsSectionSidebarItem } from "./gitops-section-sidebar-item";
import gitOpsSettingsSidebarItemInjectable from "./settings-sidebar-item.injectable";

const gitOpsRepositoriesSidebarItemInjectable = getInjectable({
  id: "sidebar-item-gitops-repositories",

  instantiate: (di) =>
    gitOpsSectionSidebarItem(di, {
      parentId: gitOpsSettingsSidebarItemInjectable.id,
      title: "Repositories",
      section: "repositories",
      orderNumber: 10,
    }),

  injectionToken: sidebarItemInjectionToken,
});

export default gitOpsRepositoriesSidebarItemInjectable;
