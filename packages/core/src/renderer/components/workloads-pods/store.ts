/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { cpuUnitsToNumber, unitsToBytes } from "@freelensapp/utilities";
import { countBy } from "es-toolkit/compat";
import { computed, observable } from "mobx";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

import type { PodApi, PodMetricsApi } from "@freelensapp/kube-api";
import type { KubeObject, NamespaceScopedMetadata, Pod, PodMetrics } from "@freelensapp/kube-object";

import type { KubeObjectStoreDependencies, KubeObjectStoreOptions } from "../../../common/k8s-api/kube-object.store";

export interface PodStoreDependencies extends KubeObjectStoreDependencies {
  readonly podMetricsApi: PodMetricsApi;
}

interface PodIndexes {
  byOwnerId: Map<string, Pod[]>;
  byNode: Map<string, Pod[]>;
  byNamespace: Map<string, Pod[]>;
}

const addTo = (index: Map<string, Pod[]>, key: string, pod: Pod) => {
  const pods = index.get(key);

  if (pods) {
    pods.push(pod);
  } else {
    index.set(key, [pod]);
  }
};

/**
 * One pass over the pods, in store order, so a lookup returns its pods in the
 * same order a filter of `items` would.
 */
const indexPods = (pods: readonly Pod[]): PodIndexes => {
  const indexes: PodIndexes = { byOwnerId: new Map(), byNode: new Map(), byNamespace: new Map() };

  for (const pod of pods) {
    const ownerIds = new Set(pod.getOwnerRefs().map((owner) => owner.uid));

    for (const ownerId of ownerIds) {
      addTo(indexes.byOwnerId, ownerId, pod);
    }

    if (typeof pod.spec?.nodeName === "string") {
      addTo(indexes.byNode, pod.spec.nodeName, pod);
    }

    addTo(indexes.byNamespace, pod.getNs(), pod);
  }

  return indexes;
};

export class PodStore extends KubeObjectStore<Pod, PodApi> {
  constructor(
    protected readonly dependencies: PodStoreDependencies,
    api: PodApi,
    opts?: KubeObjectStoreOptions,
  ) {
    super(dependencies, api, opts);
  }

  /**
   * Lookups of the pods of a workload, a node or a namespace. Views ask for
   * them once per row: a scan of every pod per workload made the workloads
   * overview quadratic. Kept alive, so the index is rebuilt once per change of
   * the pods and not on every lookup, inside or outside a reaction.
   */
  private readonly indexes = computed(() => indexPods(this.items), { keepAlive: true });

  readonly kubeMetrics = observable.array<PodMetrics>([]);

  @computed get kubeMetricsByPod(): Map<string, PodMetrics> {
    const map = new Map<string, PodMetrics>();

    for (const metric of this.kubeMetrics) {
      map.set(`${metric.getNs()}/${metric.getName()}`, metric);
    }

    return map;
  }

  async loadKubeMetrics(namespace?: string) {
    try {
      const metrics = await this.dependencies.podMetricsApi.list({ namespace });

      this.kubeMetrics.replace(metrics ?? []);
    } catch (error) {
      console.warn("loadKubeMetrics failed", error);
    }
  }

  getPodsByOwner(workload: KubeObject<NamespaceScopedMetadata, unknown, unknown>): Pod[] {
    return this.getPodsByOwnerId(workload.getId());
  }

  // Copies, so that a caller sorting or changing the result cannot change the index.
  getPodsByOwnerId(workloadId: string): Pod[] {
    return [...(this.indexes.get().byOwnerId.get(workloadId) ?? [])];
  }

  getPodsByNode(node: string) {
    if (!this.isLoaded) return [];

    return [...(this.indexes.get().byNode.get(node) ?? [])];
  }

  getPodsByNamespace(namespace: string): Pod[] {
    return [...(this.indexes.get().byNamespace.get(namespace) ?? [])];
  }

  getStatuses(pods: Pod[]) {
    return countBy(
      pods
        .map((pod) => pod.getStatus())
        .sort()
        .reverse(),
    );
  }

  getPodKubeMetrics(pod: Pod) {
    const containers = pod.getContainers();
    const empty = { cpu: 0, memory: 0 };
    const metrics = this.kubeMetricsByPod.get(`${pod.getNs()}/${pod.getName()}`);

    if (!metrics || !metrics.containers || !containers) return { cpu: NaN, memory: NaN };

    return containers.reduce((total, container) => {
      let cpu = "0";
      let memory = "0";

      const metric = metrics.containers?.find((item) => item.name == container.name);

      if (metric && metric.usage) {
        cpu = metric.usage.cpu || "0";
        memory = metric.usage.memory || "0";
      }

      return {
        cpu: total.cpu + (cpuUnitsToNumber(cpu) ?? 0),
        memory: total.memory + unitsToBytes(memory),
      };
    }, empty);
  }
}
