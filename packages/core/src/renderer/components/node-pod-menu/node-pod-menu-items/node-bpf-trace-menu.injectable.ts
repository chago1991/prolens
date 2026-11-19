/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { kubeObjectMenuItemInjectionToken } from "../../kube-object-menu/kube-object-menu-item-injection-token";
import { NodeBpfTraceMenu } from "../bpf-trace-menu";

import type { KubeObjectMenuItemComponent } from "../../kube-object-menu/kube-object-menu-item-injection-token";

const nodeBpfTraceMenuInjectable = getInjectable({
  id: "node-bpf-trace-menu-node-pod-menu",

  instantiate: () => ({
    kind: "Node",
    apiVersions: ["v1"],
    Component: NodeBpfTraceMenu as KubeObjectMenuItemComponent,
    enabled: computed(() => true),
    orderNumber: 2,
  }),
  injectionToken: kubeObjectMenuItemInjectionToken,
});

export default nodeBpfTraceMenuInjectable;
