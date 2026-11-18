/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import apiManagerInjectable from "../../../common/k8s-api/api-manager/manager.injectable";
import { formatKubeApiResource } from "../../../common/rbac";
import hostedClusterInjectable from "../../../renderer/cluster-frame-context/hosted-cluster.injectable";
import customResourceDefinitionStoreInjectable from "../../../renderer/components/custom-resource-definitions/store.injectable";
import { apiBasesOf, discoverGatewayApi, findResourceStatus } from "../common/discovery";
import { gatewayApiGroups } from "../common/kinds";

import type { KubeObject } from "@freelensapp/kube-object";

import type { IComputedValue } from "mobx";

import type { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";
import type { GatewayApiCrdInfo, GatewayApiDiscovery, GatewayApiResourceStatus } from "../common/discovery";
import type { GatewayApiResourceId } from "../common/kinds";

export type AnyKubeObjectStore = KubeObjectStore<KubeObject, any, any>;

export interface GatewayApiState {
  readonly discovery: IComputedValue<GatewayApiDiscovery>;
  readonly status: (id: GatewayApiResourceId) => GatewayApiResourceStatus | undefined;
  readonly isSupported: (id: GatewayApiResourceId) => boolean;
  /** The store of a supported resource, in the first served version the host has an API for. */
  readonly storeOf: (id: GatewayApiResourceId) => AnyKubeObjectStore | undefined;
  /** Whether the user may read the CRDs, which adds channel and bundle version. */
  readonly definitionsReadable: IComputedValue<boolean>;
  readonly clusterName: IComputedValue<string | undefined>;
}

/**
 * The Gateway API of the cluster this frame shows: which resources discovery
 * serves, in which versions, which of them RBAC lets the user list, and the
 * stores the rest of ProLens already keeps for them.
 */
const gatewayApiInjectable = getInjectable({
  id: "gateway-api",
  instantiate: (di): GatewayApiState => {
    const cluster = di.inject(hostedClusterInjectable);
    const apiManager = di.inject(apiManagerInjectable);
    const crdStore = di.inject(customResourceDefinitionStoreInjectable);

    const crds = computed((): GatewayApiCrdInfo[] =>
      crdStore.items
        .filter((crd) => gatewayApiGroups.includes(crd.getGroup()))
        .map((crd) => {
          const established = crd.getConditions().find((condition) => condition.type === "Established");

          return {
            group: crd.getGroup(),
            plural: crd.getPluralName(),
            annotations: { ...(crd.metadata.annotations ?? {}) },
            established: established ? established.status === "True" : undefined,
            servedVersions: crd.getServedVersions().map((version) => version.name),
          };
        }),
    );

    const discovery = computed(() =>
      discoverGatewayApi({
        knownResources: cluster?.knownResources ?? [],
        isAllowed: (group, apiName) => cluster?.resourcesToShow.has(formatKubeApiResource({ group, apiName })) ?? false,
        crds: crds.get(),
      }),
    );

    const status = (id: GatewayApiResourceId) => findResourceStatus(discovery.get(), id);
    const isSupported = (id: GatewayApiResourceId) => status(id)?.state === "supported";

    return {
      discovery,
      status,
      isSupported,
      storeOf: (id) => {
        const resource = status(id);

        if (resource?.state !== "supported") return undefined;

        for (const apiBase of apiBasesOf(resource)) {
          const store = apiManager.getStore(apiBase) as AnyKubeObjectStore | undefined;

          if (store) return store;
        }

        return undefined;
      },
      definitionsReadable: computed(() => crdStore.isLoaded && !crdStore.failedLoading),
      clusterName: computed(() => cluster?.name.get()),
    };
  },
});

export default gatewayApiInjectable;
