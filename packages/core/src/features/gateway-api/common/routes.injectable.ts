/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { frontEndRouteInjectionToken } from "../../../common/front-end-routing/front-end-route-injection-token";

import type { Route } from "../../../common/front-end-routing/front-end-route-injection-token";

export interface GatewayApiResourcesPathParameters {
  resource: string;
}

/** The overview: what is installed, the controllers, and how to install it. */
export const gatewayApiOverviewRouteInjectable = getInjectable({
  id: "gateway-api-overview-route",
  instantiate: () => ({
    path: "/gateway-api",
    clusterFrame: true,
    isEnabled: computed(() => true),
  }),
  injectionToken: frontEndRouteInjectionToken,
});

export const gatewayApiTopologyRouteInjectable = getInjectable({
  id: "gateway-api-topology-route",
  instantiate: () => ({
    path: "/gateway-api/topology",
    clusterFrame: true,
    isEnabled: computed(() => true),
  }),
  injectionToken: frontEndRouteInjectionToken,
});

/** One list view serves every kind; the kind is the plural of the standard group. */
export const gatewayApiResourcesRouteInjectable = getInjectable({
  id: "gateway-api-resources-route",
  instantiate: (): Route<GatewayApiResourcesPathParameters> => ({
    path: "/gateway-api/resources/:resource",
    clusterFrame: true,
    isEnabled: computed(() => true),
  }),
  injectionToken: frontEndRouteInjectionToken,
});
