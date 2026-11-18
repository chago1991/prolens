/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { showCheckedErrorNotificationInjectable, showSuccessNotificationInjectable } from "@freelensapp/notifications";
import { getInjectable } from "@ogre-tools/injectable";
import clusterFrameContextForNamespacedResourcesInjectable from "../../../renderer/cluster-frame-context/for-namespaced-resources.injectable";
import hostedClusterInjectable from "../../../renderer/cluster-frame-context/hosted-cluster.injectable";
import confirmInjectable from "../../../renderer/components/confirm-dialog/confirm.injectable";
import createResourceTabInjectable from "../../../renderer/components/dock/create-resource/create-resource-tab.injectable";
import createResourceTabStoreInjectable from "../../../renderer/components/dock/create-resource/store.injectable";
import showDetailsInjectable from "../../../renderer/components/kube-detail-params/show-details.injectable";
import namespaceStoreInjectable from "../../../renderer/components/namespaces/store.injectable";
import endpointSliceStoreInjectable from "../../../renderer/components/network-endpoint-slices/store.injectable";
import serviceStoreInjectable from "../../../renderer/components/network-services/store.injectable";
import podStoreInjectable from "../../../renderer/components/workloads-pods/store.injectable";
import subscribeStoresInjectable from "../../../renderer/kube-watch-api/subscribe-stores.injectable";
import {
  navigateToGatewayApiResourcesInjectable,
  navigateToGatewayApiTopologyInjectable,
} from "../common/navigate.injectable";
import { looksLikeProduction } from "../common/safety";
import gatewayApiCanIInjectable from "./can-i.injectable";
import gatewayApiInjectable from "./gateway-api.injectable";

import type { KubeObject } from "@freelensapp/kube-object";

import type { GatewayApiObject } from "../common/model";
import type { AnyKubeObjectStore } from "./gateway-api.injectable";

export const asGatewayApiObject = (object: KubeObject) => object as unknown as GatewayApiObject;

/** Everything the Gateway API views need, injected once. */
const gatewayApiViewDependenciesInjectable = getInjectable({
  id: "gateway-api-view-dependencies",
  instantiate: (di) => {
    const gatewayApi = di.inject(gatewayApiInjectable);
    const hostedCluster = di.inject(hostedClusterInjectable);
    const namespaceStore = di.inject(namespaceStoreInjectable);
    const confirm = di.inject(confirmInjectable);
    const showSuccess = di.inject(showSuccessNotificationInjectable);
    const showError = di.inject(showCheckedErrorNotificationInjectable);
    const createResourceTab = di.inject(createResourceTabInjectable);
    const createResourceTabStore = di.inject(createResourceTabStoreInjectable);

    const isProtected = (object: KubeObject) =>
      looksLikeProduction({
        clusterName: hostedCluster?.name.get(),
        namespace: object.getNs(),
        labels: object.metadata.labels,
        namespaceLabels: object.getNs()
          ? namespaceStore.items.find((namespace) => namespace.getName() === object.getNs())?.metadata.labels
          : undefined,
      });

    /**
     * Patches the spec of an object with a JSON merge patch. The patch carries
     * the resourceVersion the edit started from, so the API server refuses it
     * when someone else changed the object in between.
     */
    const patchSpec = async (
      store: AnyKubeObjectStore | undefined,
      object: KubeObject,
      spec: Record<string, unknown>,
      summary: string,
    ) => {
      if (!store) throw new Error("The resource is not available.");

      const confirmed = await confirm({
        labelOk: "Apply",
        message: `${summary} on ${object.kind} ${object.getNs() ? `${object.getNs()}/` : ""}${object.getName()}?`,
      });

      if (!confirmed) throw new Error("cancelled");

      try {
        await store.patch(object, { metadata: { resourceVersion: object.getResourceVersion() }, spec } as any, "merge");
        showSuccess(`${object.kind} ${object.getName()} updated.`);
      } catch (error) {
        showError(error, `Updating ${object.kind} ${object.getName()} failed.`);
        throw error;
      }
    };

    return {
      gatewayApi,
      context: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
      showDetails: di.inject(showDetailsInjectable),
      subscribeStores: di.inject(subscribeStoresInjectable),
      serviceStore: di.inject(serviceStoreInjectable) as unknown as AnyKubeObjectStore,
      endpointSliceStore: di.inject(endpointSliceStoreInjectable) as unknown as AnyKubeObjectStore,
      podStore: di.inject(podStoreInjectable) as unknown as AnyKubeObjectStore,
      namespaceStore,
      canI: di.inject(gatewayApiCanIInjectable),
      navigateToTopology: di.inject(navigateToGatewayApiTopologyInjectable),
      navigateToResources: di.inject(navigateToGatewayApiResourcesInjectable),
      knownResources: () => hostedCluster?.knownResources ?? [],
      isProtected,
      patchSpec,
      openCreate: (yaml: string) => {
        const tab = createResourceTab({ title: "Create Gateway API resource" });

        createResourceTabStore.setData(tab.id, yaml);
      },
    };
  },
});

export type GatewayApiViewDependencies = ReturnType<(typeof gatewayApiViewDependenciesInjectable)["instantiate"]>;

export default gatewayApiViewDependenciesInjectable;
