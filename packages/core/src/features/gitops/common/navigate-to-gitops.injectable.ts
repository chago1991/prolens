/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { navigateToRouteInjectionToken } from "../../../common/front-end-routing/navigate-to-route-injection-token";
import gitOpsRouteInjectable from "./gitops-route.injectable";

const navigateToGitOpsInjectable = getInjectable({
  id: "navigate-to-gitops",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(gitOpsRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToGitOpsInjectable;
