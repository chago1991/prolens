/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { kubeObjectMenuItemInjectionToken } from "../../kube-object-menu/kube-object-menu-item-injection-token";
import { PodBpfTraceMenu } from "../bpf-trace-menu";

import type { KubeObjectMenuItemComponent } from "../../kube-object-menu/kube-object-menu-item-injection-token";

const podBpfTraceMenuInjectable = getInjectable({
  id: "pod-bpf-trace-menu-node-pod-menu",

  instantiate: () => ({
    kind: "Pod",
    apiVersions: ["v1"],
    Component: PodBpfTraceMenu as KubeObjectMenuItemComponent,
    enabled: computed(() => true),
    orderNumber: 4,
  }),
  injectionToken: kubeObjectMenuItemInjectionToken,
});

export default podBpfTraceMenuInjectable;
