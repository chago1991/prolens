/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Deployment, Pod } from "@freelensapp/kube-object";
import { autorun, observable, runInAction } from "mobx";
import { beforeEach, describe, expect, it } from "vitest";
import directoryForKubeConfigsInjectable from "../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import { Cluster } from "../../../common/cluster/cluster";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import deploymentStoreInjectable from "../workloads-deployments/store.injectable";
import podStoreInjectable from "./store.injectable";

import type { KubeJsonApiDataFor } from "@freelensapp/kube-object";

import type { DeploymentStore } from "../workloads-deployments/store";
import type { PodStore } from "./store";

const pod = (
  name: string,
  {
    namespace = "default",
    node,
    owners = [],
    labels = {},
  }: { namespace?: string; node?: string; owners?: string[]; labels?: Record<string, string> },
) =>
  new Pod({
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name,
      namespace,
      uid: `uid-${namespace}-${name}`,
      resourceVersion: "1",
      selfLink: `/api/v1/namespaces/${namespace}/pods/${name}`,
      labels,
      ownerReferences: owners.map((uid) => ({ apiVersion: "apps/v1", kind: "ReplicaSet", name: uid, uid })),
    },
    spec: { nodeName: node, containers: [] },
  } as unknown as KubeJsonApiDataFor<Pod>);

const deployment = (name: string, namespace: string, labels: Record<string, string>) =>
  new Deployment({
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name, namespace, uid: `deploy-${name}`, resourceVersion: "1", selfLink: `/apis/apps/v1/${name}` },
    spec: { selector: { matchLabels: labels }, template: { metadata: { labels } } },
  } as unknown as KubeJsonApiDataFor<Deployment>);

// What the lookups did before the index: a scan of every pod.
const scan = {
  byOwner: (pods: Pod[], uid: string) => pods.filter((p) => p.getOwnerRefs().find((owner) => owner.uid === uid)),
  byNode: (pods: Pod[], node: string) => pods.filter((p) => p.spec.nodeName === node),
  byNamespace: (pods: Pod[], namespace: string) => pods.filter((p) => p.getNs() === namespace),
};

const names = (pods: Pod[]) => pods.map((p) => p.getName());

describe("PodStore indexed lookups", () => {
  let podStore: PodStore;
  let deploymentStore: DeploymentStore;
  let pods: Pod[];

  beforeEach(() => {
    const di = getDiForUnitTesting();

    di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    di.override(storesAndApisCanBeCreatedInjectable, () => true);
    di.override(
      hostedClusterInjectable,
      () => new Cluster({ contextName: "some-context-name", id: "some-cluster-id", kubeConfigPath: "/some-path" }),
    );

    podStore = di.inject(podStoreInjectable);
    deploymentStore = di.inject(deploymentStoreInjectable);
    pods = [
      pod("a", { node: "n1", owners: ["rs-1"], labels: { app: "web" } }),
      pod("b", { node: "n2", owners: ["rs-1"], labels: { app: "web", tier: "front" } }),
      pod("c", { node: "n1", owners: ["rs-2"], labels: { app: "db" } }),
      pod("d", { namespace: "other", node: "n1", owners: ["rs-1", "rs-1"], labels: { app: "web" } }),
      pod("e", { node: "" }),
      pod("f", {}),
    ];
    podStore.items = observable.array(pods, { deep: false });
    podStore.isLoaded = true;
  });

  const expectSameAsScan = () => {
    const current = podStore.getItems();

    for (const uid of ["rs-1", "rs-2", "rs-3"]) {
      expect(names(podStore.getPodsByOwnerId(uid))).toEqual(names(scan.byOwner(current, uid)));
    }

    for (const node of ["n1", "n2", "n3", ""]) {
      expect(names(podStore.getPodsByNode(node))).toEqual(names(scan.byNode(current, node)));
    }

    for (const namespace of ["default", "other", "missing"]) {
      expect(names(podStore.getPodsByNamespace(namespace))).toEqual(names(scan.byNamespace(current, namespace)));
    }
  };

  it("returns what a scan of every pod returns, in store order", () => {
    expectSameAsScan();
  });

  it("lists a pod once even when it names the same owner twice", () => {
    expect(names(podStore.getPodsByOwnerId("rs-1"))).toEqual(["a", "b", "d"]);
  });

  it("follows additions, removals and replacements outside a reaction", () => {
    runInAction(() => {
      podStore.items.push(pod("g", { node: "n3", owners: ["rs-3"] }));
      podStore.items.splice(0, 1);
      podStore.items[1] = pod("c", { node: "n2", owners: ["rs-1"], labels: { app: "db" } });
    });

    expectSameAsScan();
  });

  it("follows a replaced items array", () => {
    podStore.items = observable.array([pod("z", { node: "n1", owners: ["rs-2"] })], { deep: false });

    expectSameAsScan();
    expect(names(podStore.getPodsByOwnerId("rs-2"))).toEqual(["z"]);
  });

  it("re-runs a reaction that reads a lookup when the pods change", () => {
    const seen: string[][] = [];
    const dispose = autorun(() => seen.push(names(podStore.getPodsByNode("n3"))));

    runInAction(() => podStore.items.push(pod("g", { node: "n3" })));
    dispose();

    expect(seen).toEqual([[], ["g"]]);
  });

  it("returns copies, which a caller can change without changing the store", () => {
    podStore.getPodsByOwnerId("rs-1").reverse().pop();

    expect(names(podStore.getPodsByOwnerId("rs-1"))).toEqual(["a", "b", "d"]);
  });

  it("returns no pods of a node before the pods are loaded", () => {
    podStore.isLoaded = false;

    expect(podStore.getPodsByNode("n1")).toEqual([]);
  });

  it("matches a deployment's pods by its template labels within its namespace", () => {
    const web = deployment("web", "default", { app: "web" });
    const front = deployment("front", "default", { app: "web", tier: "front" });
    const byLabel = (d: Deployment) =>
      names(podStore.getByLabel(d.getTemplateLabels()).filter((p) => p.getNs() === d.getNs()));

    expect(names(deploymentStore.getChildPods(web))).toEqual(byLabel(web));
    expect(names(deploymentStore.getChildPods(web))).toEqual(["a", "b"]);
    expect(names(deploymentStore.getChildPods(front))).toEqual(["b"]);
  });
});
