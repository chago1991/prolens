/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemInjectionToken } from "@freelensapp/cluster-sidebar";
import { Icon } from "@freelensapp/icon";
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { SidebarMenuItem, sidebarMenuItemIds } from "../../../common/sidebar-menu-items-starting-order";
import routeIsActiveInjectable from "../../../renderer/routes/route-is-active.injectable";
import storesAndApisCanBeCreatedInjectable from "../../../renderer/stores-apis-can-be-created.injectable";
import { getClusterPageMenuOrderInjectable } from "../../user-preferences/common/cluster-page-menu-order.injectable";
import gitOpsRouteInjectable from "../common/gitops-route.injectable";
import navigateToGitOpsInjectable from "../common/navigate-to-gitops.injectable";
import gitOpsSourceInjectable from "./gitops-source.injectable";

const id = SidebarMenuItem.GitOps;

/** Shown only when Argo CD or Flux is installed in the cluster. */
const gitOpsSidebarItemInjectable = getInjectable({
  id,

  instantiate: (di) => {
    const route = di.inject(gitOpsRouteInjectable);
    // Sidebar items are also read outside cluster frames, by the command
    // palette, where stores cannot be created: the source is injected late.
    const inClusterFrame = di.inject(storesAndApisCanBeCreatedInjectable);
    const getClusterPageMenuOrder = di.inject(getClusterPageMenuOrderInjectable);

    return {
      parentId: null,
      title: "GitOps",
      getIcon: () => <Icon material="merge_type" />,
      onClick: di.inject(navigateToGitOpsInjectable),
      isActive: di.inject(routeIsActiveInjectable, route),
      isVisible: computed(() => inClusterFrame && di.inject(gitOpsSourceInjectable).tools.get().length > 0),
      orderNumber: getClusterPageMenuOrder(id, sidebarMenuItemIds[id]),
    };
  },

  injectionToken: sidebarItemInjectionToken,
});

export default gitOpsSidebarItemInjectable;
