/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { frontEndRouteInjectionToken } from "../../../common/front-end-routing/front-end-route-injection-token";

import type { Route } from "../../../common/front-end-routing/front-end-route-injection-token";

/** The pages of the GitOps view; no section is the dashboard. */
export const gitOpsSections = ["applications", "applicationsets", "projects", "repositories", "clusters"] as const;

export type GitOpsSection = (typeof gitOpsSections)[number];

export interface GitOpsPathParameters {
  section?: GitOpsSection;
}

const gitOpsRouteInjectable = getInjectable({
  id: "gitops-route",

  instantiate: (): Route<GitOpsPathParameters> => ({
    path: "/gitops/:section?",
    clusterFrame: true,
    isEnabled: computed(() => true),
  }),

  injectionToken: frontEndRouteInjectionToken,
});

export default gitOpsRouteInjectable;
