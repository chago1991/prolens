/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { routeSpecificComponentInjectionToken } from "../../../renderer/routes/route-specific-component-injection-token";
import {
  gatewayApiOverviewRouteInjectable,
  gatewayApiResourcesRouteInjectable,
  gatewayApiTopologyRouteInjectable,
} from "../common/routes.injectable";
import { GatewayApiOverview } from "./components/overview";
import { GatewayApiResources } from "./components/resource-list";
import { GatewayApiTopology } from "./components/topology";

export const gatewayApiOverviewRouteComponentInjectable = getInjectable({
  id: "gateway-api-overview-route-component",
  instantiate: (di) => ({
    route: di.inject(gatewayApiOverviewRouteInjectable),
    Component: GatewayApiOverview,
  }),
  injectionToken: routeSpecificComponentInjectionToken,
});

export const gatewayApiResourcesRouteComponentInjectable = getInjectable({
  id: "gateway-api-resources-route-component",
  instantiate: (di) => ({
    route: di.inject(gatewayApiResourcesRouteInjectable),
    Component: GatewayApiResources,
  }),
  injectionToken: routeSpecificComponentInjectionToken,
});

export const gatewayApiTopologyRouteComponentInjectable = getInjectable({
  id: "gateway-api-topology-route-component",
  instantiate: (di) => ({
    route: di.inject(gatewayApiTopologyRouteInjectable),
    Component: GatewayApiTopology,
  }),
  injectionToken: routeSpecificComponentInjectionToken,
});
