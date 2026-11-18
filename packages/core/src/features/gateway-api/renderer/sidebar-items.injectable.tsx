/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemInjectionToken } from "@freelensapp/cluster-sidebar";
import { computedAnd } from "@freelensapp/utilities";
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import networkSidebarItemInjectable from "../../../renderer/components/network/network-sidebar-item.injectable";
import routeIsActiveInjectable from "../../../renderer/routes/route-is-active.injectable";
import routePathParametersInjectable from "../../../renderer/routes/route-path-parameters.injectable";
import storesAndApisCanBeCreatedInjectable from "../../../renderer/stores-apis-can-be-created.injectable";
import { gatewayApiKinds } from "../common/kinds";
import {
  navigateToGatewayApiOverviewInjectable,
  navigateToGatewayApiResourcesInjectable,
  navigateToGatewayApiTopologyInjectable,
} from "../common/navigate.injectable";
import {
  gatewayApiOverviewRouteInjectable,
  gatewayApiResourcesRouteInjectable,
  gatewayApiTopologyRouteInjectable,
} from "../common/routes.injectable";
import gatewayApiInjectable from "./gateway-api.injectable";

import type { SidebarItemRegistration } from "@freelensapp/cluster-sidebar";

import type { DiContainerForInjection } from "@ogre-tools/injectable";

import type { GatewayApiResourceId } from "../common/kinds";

export const gatewayApiSidebarItemId = "sidebar-item-gateway-api";

/**
 * Whether any of the resources is supported. Sidebar items are also read
 * outside cluster frames, by the command palette, where stores cannot be
 * created, so the Gateway API source is injected only inside a cluster frame.
 */
const anySupported = (di: DiContainerForInjection, ids: readonly GatewayApiResourceId[]) => {
  const inClusterFrame = di.inject(storesAndApisCanBeCreatedInjectable);

  return computed(() => {
    if (!inClusterFrame) return false;

    const gatewayApi = di.inject(gatewayApiInjectable);

    return ids.some((id) => gatewayApi.isSupported(id));
  });
};

/** The collapsible "Gateway API" section under Network. */
export const gatewayApiSidebarItemInjectable = getInjectable({
  id: gatewayApiSidebarItemId,
  instantiate: (di): SidebarItemRegistration => ({
    parentId: networkSidebarItemInjectable.id,
    title: "Gateway API",
    onClick: di.inject(navigateToGatewayApiOverviewInjectable),
    orderNumber: 35,
  }),
  injectionToken: sidebarItemInjectionToken,
});

export const gatewayApiOverviewSidebarItemInjectable = getInjectable({
  id: "sidebar-item-gateway-api-overview",
  instantiate: (di): SidebarItemRegistration => ({
    parentId: gatewayApiSidebarItemId,
    title: "Overview",
    onClick: di.inject(navigateToGatewayApiOverviewInjectable),
    isActive: di.inject(routeIsActiveInjectable, di.inject(gatewayApiOverviewRouteInjectable)),
    orderNumber: 1,
  }),
  injectionToken: sidebarItemInjectionToken,
});

export const gatewayApiTopologySidebarItemInjectable = getInjectable({
  id: "sidebar-item-gateway-api-topology",
  instantiate: (di): SidebarItemRegistration => {
    return {
      parentId: gatewayApiSidebarItemId,
      title: "Topology",
      onClick: () => di.inject(navigateToGatewayApiTopologyInjectable)(),
      isActive: di.inject(routeIsActiveInjectable, di.inject(gatewayApiTopologyRouteInjectable)),
      isVisible: anySupported(di, ["gateways", "gatewayclasses"]),
      orderNumber: 2,
    };
  },
  injectionToken: sidebarItemInjectionToken,
});

const resourceSidebarItem = (id: GatewayApiResourceId) => {
  const index = gatewayApiKinds.findIndex((kind) => kind.id === id);
  const definition = gatewayApiKinds[index];

  return getInjectable({
    id: `sidebar-item-gateway-api-${id}`,
    instantiate: (di: DiContainerForInjection): SidebarItemRegistration => {
      const route = di.inject(gatewayApiResourcesRouteInjectable);
      const pathParameters = di.inject(routePathParametersInjectable, route);
      const navigate = di.inject(navigateToGatewayApiResourcesInjectable);

      return {
        parentId: gatewayApiSidebarItemId,
        title: definition.title,
        onClick: () => navigate(id),
        isActive: computedAnd(
          di.inject(routeIsActiveInjectable, route),
          computed(() => pathParameters.get().resource === id),
        ),
        isVisible: anySupported(di, [id]),
        orderNumber: 10 + index,
      };
    },
    injectionToken: sidebarItemInjectionToken,
  });
};

export const gatewayClassesSidebarItemInjectable = resourceSidebarItem("gatewayclasses");
export const gatewaysSidebarItemInjectable = resourceSidebarItem("gateways");
export const httpRoutesSidebarItemInjectable = resourceSidebarItem("httproutes");
export const grpcRoutesSidebarItemInjectable = resourceSidebarItem("grpcroutes");
export const tcpRoutesSidebarItemInjectable = resourceSidebarItem("tcproutes");
export const tlsRoutesSidebarItemInjectable = resourceSidebarItem("tlsroutes");
export const udpRoutesSidebarItemInjectable = resourceSidebarItem("udproutes");
export const referenceGrantsSidebarItemInjectable = resourceSidebarItem("referencegrants");
export const backendTlsPoliciesSidebarItemInjectable = resourceSidebarItem("backendtlspolicies");
export const listenerSetsSidebarItemInjectable = resourceSidebarItem("listenersets");
