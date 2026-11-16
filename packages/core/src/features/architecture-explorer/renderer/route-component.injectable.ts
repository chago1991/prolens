/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { routeSpecificComponentInjectionToken } from "../../../renderer/routes/route-specific-component-injection-token";
import architectureExplorerRouteInjectable from "../common/architecture-explorer-route.injectable";
import { ArchitectureExplorer } from "./components/architecture-explorer";

const architectureExplorerRouteComponentInjectable = getInjectable({
  id: "architecture-explorer-route-component",

  instantiate: (di) => ({
    route: di.inject(architectureExplorerRouteInjectable),
    Component: ArchitectureExplorer,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default architectureExplorerRouteComponentInjectable;
