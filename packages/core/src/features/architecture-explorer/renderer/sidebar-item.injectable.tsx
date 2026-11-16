/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemInjectionToken } from "@freelensapp/cluster-sidebar";
import { Icon } from "@freelensapp/icon";
import { getInjectable } from "@ogre-tools/injectable";
import { SidebarMenuItem, sidebarMenuItemIds } from "../../../common/sidebar-menu-items-starting-order";
import routeIsActiveInjectable from "../../../renderer/routes/route-is-active.injectable";
import { getClusterPageMenuOrderInjectable } from "../../user-preferences/common/cluster-page-menu-order.injectable";
import architectureExplorerRouteInjectable from "../common/architecture-explorer-route.injectable";
import navigateToArchitectureExplorerInjectable from "../common/navigate-to-architecture-explorer.injectable";

const id = SidebarMenuItem.Architecture;

const architectureExplorerSidebarItemInjectable = getInjectable({
  id,

  instantiate: (di) => {
    const route = di.inject(architectureExplorerRouteInjectable);
    const getClusterPageMenuOrder = di.inject(getClusterPageMenuOrderInjectable);

    return {
      parentId: null,
      title: "Architecture",
      getIcon: () => <Icon material="hub" />,
      onClick: di.inject(navigateToArchitectureExplorerInjectable),
      isActive: di.inject(routeIsActiveInjectable, route),
      isVisible: route.isEnabled,
      orderNumber: getClusterPageMenuOrder(id, sidebarMenuItemIds[id]),
    };
  },

  injectionToken: sidebarItemInjectionToken,
});

export default architectureExplorerSidebarItemInjectable;
