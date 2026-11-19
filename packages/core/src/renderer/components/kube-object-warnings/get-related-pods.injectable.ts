/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Deployment, Pod } from "@freelensapp/kube-object";
import { getInjectable } from "@ogre-tools/injectable";
import deploymentStoreInjectable from "../workloads-deployments/store.injectable";
import podStoreInjectable from "../workloads-pods/store.injectable";

import type { KubeObject } from "@freelensapp/kube-object";

export type GetRelatedPods = (object: KubeObject) => Pod[];

/**
 * The pods of an object, as far as the pod store has them: the pod itself,
 * the pods a Deployment's template selects, or the pods another workload
 * owns. Reads the stores only, and makes no request.
 */
const getRelatedPodsInjectable = getInjectable({
  id: "get-related-pods",
  instantiate: (di): GetRelatedPods => {
    const podStore = di.inject(podStoreInjectable);
    const deploymentStore = di.inject(deploymentStoreInjectable);

    return (object) => {
      if (object instanceof Pod) {
        return [object];
      }

      if (object instanceof Deployment) {
        return deploymentStore.getChildPods(object);
      }

      return podStore.getPodsByOwnerId(object.getId());
    };
  },
});

export default getRelatedPodsInjectable;
