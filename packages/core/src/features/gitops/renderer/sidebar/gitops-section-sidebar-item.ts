/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { computedAnd } from "@freelensapp/utilities";
import { computed } from "mobx";
import routeIsActiveInjectable from "../../../../renderer/routes/route-is-active.injectable";
import routePathParametersInjectable from "../../../../renderer/routes/route-path-parameters.injectable";
import storesAndApisCanBeCreatedInjectable from "../../../../renderer/stores-apis-can-be-created.injectable";
import gitOpsRouteInjectable from "../../common/gitops-route.injectable";
import navigateToGitOpsInjectable from "../../common/navigate-to-gitops.injectable";
import gitOpsSourceInjectable from "../gitops-source.injectable";

import type { SidebarItemRegistration } from "@freelensapp/cluster-sidebar";

import type { DiContainerForInjection } from "@ogre-tools/injectable";

import type { GitOpsSection } from "../../common/gitops-route.injectable";
import type { GitOpsTool } from "../gitops-model";

/** A page of the GitOps view in the sidebar, active while that page is open. */
export const gitOpsSectionSidebarItem = (
  di: DiContainerForInjection,
  {
    parentId,
    title,
    section,
    orderNumber,
    tool,
  }: {
    parentId: string;
    title: string;
    /** No section is the dashboard. */
    section: GitOpsSection | undefined;
    orderNumber: number;
    /** Shown only when this tool is installed. */
    tool?: GitOpsTool;
  },
): SidebarItemRegistration => {
  const route = di.inject(gitOpsRouteInjectable);
  const pathParameters = di.inject(routePathParametersInjectable, route);
  const navigateToGitOps = di.inject(navigateToGitOpsInjectable);
  const inClusterFrame = di.inject(storesAndApisCanBeCreatedInjectable);

  return {
    parentId,
    title,
    onClick: () => navigateToGitOps(section),
    isActive: computedAnd(
      di.inject(routeIsActiveInjectable, route),
      computed(() => (pathParameters.get().section || undefined) === section),
    ),
    // The source is injected late: the command palette reads sidebar items
    // outside cluster frames, where stores cannot be created.
    isVisible: computed(() => {
      if (!inClusterFrame) return false;

      const tools = di.inject(gitOpsSourceInjectable).tools.get();

      return tool ? tools.includes(tool) : tools.length > 0;
    }),
    orderNumber,
  };
};
