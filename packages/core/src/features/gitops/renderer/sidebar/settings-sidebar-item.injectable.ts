/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemInjectionToken } from "@freelensapp/cluster-sidebar";
import { getInjectable } from "@ogre-tools/injectable";
import { noop } from "es-toolkit";
import gitOpsSidebarItemInjectable from "../sidebar-item.injectable";

/** Repositories and clusters; hidden with them when none applies. */
const gitOpsSettingsSidebarItemInjectable = getInjectable({
  id: "sidebar-item-gitops-settings",

  instantiate: () => ({
    parentId: gitOpsSidebarItemInjectable.id,
    title: "Settings",
    onClick: noop,
    orderNumber: 90,
  }),

  injectionToken: sidebarItemInjectionToken,
});

export default gitOpsSettingsSidebarItemInjectable;
