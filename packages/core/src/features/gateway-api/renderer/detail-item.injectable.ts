/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import currentKubeObjectInDetailsInjectable from "../../../renderer/components/kube-object-details/current-kube-object-in-details.injectable";
import { kubeObjectDetailItemInjectionToken } from "../../../renderer/components/kube-object-details/kube-object-detail-items/kube-object-detail-item-injection-token";
import { getGatewayApiKindOf } from "../common/kinds";
import { GatewayApiDetails } from "./components/details";

/**
 * The details of every Gateway API kind, in any version the cluster serves.
 * The generic details of custom resources (printer columns, conditions) and
 * the events follow it.
 */
const gatewayApiDetailItemInjectable = getInjectable({
  id: "gateway-api-detail-item",
  instantiate: (di) => {
    const current = di.inject(currentKubeObjectInDetailsInjectable);

    return {
      Component: GatewayApiDetails,
      enabled: computed(() => {
        const object = current.value.get()?.object;

        return Boolean(getGatewayApiKindOf(object?.apiVersion, object?.kind));
      }),
      orderNumber: 20,
    };
  },
  injectionToken: kubeObjectDetailItemInjectionToken,
});

export default gatewayApiDetailItemInjectable;
