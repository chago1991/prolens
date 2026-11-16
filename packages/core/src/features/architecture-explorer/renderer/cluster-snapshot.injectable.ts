/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import apiManagerInjectable from "../../../common/k8s-api/api-manager/manager.injectable";
import clusterFrameContextForNamespacedResourcesInjectable from "../../../renderer/cluster-frame-context/for-namespaced-resources.injectable";
import configMapStoreInjectable from "../../../renderer/components/config-maps/store.injectable";
import secretStoreInjectable from "../../../renderer/components/config-secrets/store.injectable";
import customResourceDefinitionStoreInjectable from "../../../renderer/components/custom-resource-definitions/store.injectable";
import eventStoreInjectable from "../../../renderer/components/events/store.injectable";
import namespaceStoreInjectable from "../../../renderer/components/namespaces/store.injectable";
import endpointSliceStoreInjectable from "../../../renderer/components/network-endpoint-slices/store.injectable";
import ingressClassStoreInjectable from "../../../renderer/components/network-ingresses/ingress-class-store.injectable";
import ingressStoreInjectable from "../../../renderer/components/network-ingresses/ingress-store.injectable";
import networkPolicyStoreInjectable from "../../../renderer/components/network-policies/store.injectable";
import serviceStoreInjectable from "../../../renderer/components/network-services/store.injectable";
import nodeStoreInjectable from "../../../renderer/components/nodes/store.injectable";
import storageClassStoreInjectable from "../../../renderer/components/storage-classes/store.injectable";
import persistentVolumeClaimStoreInjectable from "../../../renderer/components/storage-volume-claims/store.injectable";
import persistentVolumeStoreInjectable from "../../../renderer/components/storage-volumes/store.injectable";
import serviceAccountStoreInjectable from "../../../renderer/components/user-management/service-accounts/store.injectable";
import cronJobStoreInjectable from "../../../renderer/components/workloads-cronjobs/store.injectable";
import daemonSetStoreInjectable from "../../../renderer/components/workloads-daemonsets/store.injectable";
import deploymentStoreInjectable from "../../../renderer/components/workloads-deployments/store.injectable";
import jobStoreInjectable from "../../../renderer/components/workloads-jobs/store.injectable";
import podStoreInjectable from "../../../renderer/components/workloads-pods/store.injectable";
import replicaSetStoreInjectable from "../../../renderer/components/workloads-replicasets/store.injectable";
import statefulSetStoreInjectable from "../../../renderer/components/workloads-statefulsets/store.injectable";
import { shouldShowResourceInjectionToken } from "../../cluster/showing-kube-resources/common/allowed-resources-injection-token";
import { ciliumGroup, gatewayApiGroup, groupOf } from "./graph/build-graph";

import type { KubeObject } from "@freelensapp/kube-object";

import type { IComputedValue } from "mobx";

import type { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";
import type { ClusterSnapshot, ResourceEvent, ResourceObject } from "./graph/types";

/** Custom resources the explorer understands, when the cluster has them. */
const customKinds: Record<string, readonly string[]> = {
  [gatewayApiGroup]: ["Gateway", "GatewayClass", "HTTPRoute", "GRPCRoute", "TLSRoute", "TCPRoute", "UDPRoute"],
  [ciliumGroup]: ["CiliumNetworkPolicy", "CiliumClusterwideNetworkPolicy"],
};

type AnyStore = KubeObjectStore<KubeObject, any, any>;

export interface ClusterSnapshotSource {
  /** The stores to subscribe to while the explorer is open. */
  readonly stores: IComputedValue<AnyStore[]>;
  readonly snapshot: IComputedValue<ClusterSnapshot>;
  /** Kinds that could not be listed, for the status line. */
  readonly unavailableKinds: IComputedValue<string[]>;
  /** Whether a watch of any store is interrupted. */
  readonly interrupted: IComputedValue<boolean>;
  readonly loading: IComputedValue<boolean>;
  readonly namespaces: IComputedValue<string[]>;
}

const pluralOf = (store: AnyStore) => store.api.apiBase.split("/").pop() ?? "";

/**
 * The resources of the cluster this frame shows, from the stores the rest of
 * ProLens already uses. Nothing here reaches another cluster.
 */
const clusterSnapshotSourceInjectable = getInjectable({
  id: "architecture-explorer-cluster-snapshot",

  instantiate: (di): ClusterSnapshotSource => {
    const context = di.inject(clusterFrameContextForNamespacedResourcesInjectable);
    const apiManager = di.inject(apiManagerInjectable);
    const crdStore = di.inject(customResourceDefinitionStoreInjectable);
    const eventStore = di.inject(eventStoreInjectable);
    const namespaceStore = di.inject(namespaceStoreInjectable);
    const builtIn = [
      di.inject(podStoreInjectable),
      di.inject(deploymentStoreInjectable),
      di.inject(statefulSetStoreInjectable),
      di.inject(daemonSetStoreInjectable),
      di.inject(replicaSetStoreInjectable),
      di.inject(jobStoreInjectable),
      di.inject(cronJobStoreInjectable),
      di.inject(serviceStoreInjectable),
      di.inject(endpointSliceStoreInjectable),
      di.inject(ingressStoreInjectable),
      di.inject(ingressClassStoreInjectable),
      di.inject(configMapStoreInjectable),
      di.inject(secretStoreInjectable),
      di.inject(serviceAccountStoreInjectable),
      di.inject(persistentVolumeClaimStoreInjectable),
      di.inject(persistentVolumeStoreInjectable),
      di.inject(storageClassStoreInjectable),
      di.inject(networkPolicyStoreInjectable),
      di.inject(nodeStoreInjectable),
    ] as unknown as AnyStore[];

    const allowed = (store: AnyStore) =>
      di
        .inject(shouldShowResourceInjectionToken, {
          apiName: pluralOf(store),
          group: groupOf(store.api.apiVersionWithGroup ?? ""),
        })
        .get();

    const customStores = computed(() =>
      crdStore.items
        .filter((crd) => customKinds[crd.getGroup()]?.includes(crd.getResourceKind()))
        .map(
          (crd) => apiManager.getStore(crd.getResourceApiBase(crd.getPreferredVersion().name)) as AnyStore | undefined,
        )
        .filter((store): store is AnyStore => Boolean(store)),
    );

    const objectStores = computed(() => [...builtIn.filter(allowed), ...customStores.get()]);

    const coverage = computed(() => {
      const loaded = new Map<string, boolean>();

      for (const store of objectStores.get()) {
        loaded.set(
          `${groupOf(store.api.apiVersionWithGroup ?? "")}/${store.api.kind}`,
          store.isLoaded && !store.failedLoading,
        );
      }

      const selected = new Set(context.contextNamespaces);
      const all = context.hasSelectedAll;

      return {
        isLoaded: (group: string, kind: string, namespace?: string) =>
          loaded.get(`${group}/${kind}`) === true && (namespace === undefined || all || selected.has(namespace)),
      };
    });

    const snapshot = computed(
      (): ClusterSnapshot => ({
        objects: objectStores.get().flatMap((store) => store.items as unknown as ResourceObject[]),
        events: eventStore.items as unknown as ResourceEvent[],
        coverage: coverage.get(),
      }),
    );

    return {
      stores: computed(() => [...objectStores.get(), eventStore as unknown as AnyStore]),
      snapshot,
      unavailableKinds: computed(() => [
        ...builtIn.filter((store) => !allowed(store)).map((store) => store.api.kind),
        ...objectStores
          .get()
          .filter((store) => store.failedLoading)
          .map((store) => store.api.kind),
      ]),
      interrupted: computed(() => objectStores.get().some((store) => store.isWatchInterrupted)),
      loading: computed(() => objectStores.get().some((store) => !store.isLoaded && !store.failedLoading)),
      namespaces: computed(() => {
        const names = namespaceStore.items.map((namespace) => namespace.getName());

        return (names.length ? names : context.contextNamespaces).slice().sort();
      }),
    };
  },
});

export default clusterSnapshotSourceInjectable;
