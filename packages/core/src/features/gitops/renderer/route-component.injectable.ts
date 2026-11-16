/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { routeSpecificComponentInjectionToken } from "../../../renderer/routes/route-specific-component-injection-token";
import gitOpsRouteInjectable from "../common/gitops-route.injectable";
import { GitOpsView } from "./components/gitops-view";

const gitOpsRouteComponentInjectable = getInjectable({
  id: "gitops-route-component",

  instantiate: (di) => ({
    route: di.inject(gitOpsRouteInjectable),
    Component: GitOpsView,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default gitOpsRouteComponentInjectable;
