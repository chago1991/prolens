/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { navigateToRouteInjectionToken } from "../../../common/front-end-routing/navigate-to-route-injection-token";
import gitOpsRouteInjectable from "./gitops-route.injectable";

import type { GitOpsSection } from "./gitops-route.injectable";

export type NavigateToGitOps = (section?: GitOpsSection) => void;

const navigateToGitOpsInjectable = getInjectable({
  id: "navigate-to-gitops",

  instantiate: (di): NavigateToGitOps => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(gitOpsRouteInjectable);

    return (section) => navigateToRoute(route, { parameters: { section } });
  },
});

export default navigateToGitOpsInjectable;
