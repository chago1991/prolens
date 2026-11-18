/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { navigateToRouteInjectionToken } from "../../../common/front-end-routing/navigate-to-route-injection-token";
import {
  gatewayApiOverviewRouteInjectable,
  gatewayApiResourcesRouteInjectable,
  gatewayApiTopologyRouteInjectable,
} from "./routes.injectable";

import type { GatewayApiResourceId } from "./kinds";

export const navigateToGatewayApiOverviewInjectable = getInjectable({
  id: "navigate-to-gateway-api-overview",
  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(gatewayApiOverviewRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export interface TopologyQuery {
  gateway?: string;
}

export const navigateToGatewayApiTopologyInjectable = getInjectable({
  id: "navigate-to-gateway-api-topology",
  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(gatewayApiTopologyRouteInjectable);

    return (query: TopologyQuery = {}) =>
      navigateToRoute(route, query.gateway ? { query: { gateway: query.gateway } } : undefined);
  },
});

export const navigateToGatewayApiResourcesInjectable = getInjectable({
  id: "navigate-to-gateway-api-resources",
  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(gatewayApiResourcesRouteInjectable);

    return (resource: GatewayApiResourceId) => navigateToRoute(route, { parameters: { resource } });
  },
});
