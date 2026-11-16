/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/*
 * Benchmarks of the renderer stores on generated large clusters. They run only
 * with PROLENS_BENCH=1 (`pnpm bench`) and print a table; nothing in them is a
 * pass/fail threshold, because timings depend on the machine. Results and how
 * to read them are in docs/prolens/performance.md.
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DaemonSet, Deployment, Job, Pod, ReplicaSet, StatefulSet } from "@freelensapp/kube-object";
import { includes } from "@freelensapp/utilities";
import { autorun, observable, runInAction } from "mobx";
import { describe, expect, it } from "vitest";
import directoryForKubeConfigsInjectable from "../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import { Cluster } from "../../../common/cluster/cluster";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import daemonSetStoreInjectable from "../workloads-daemonsets/store.injectable";
import deploymentStoreInjectable from "../workloads-deployments/store.injectable";
import jobStoreInjectable from "../workloads-jobs/store.injectable";
import podStoreInjectable from "../workloads-pods/store.injectable";
import replicaSetStoreInjectable from "../workloads-replicasets/store.injectable";
import statefulSetStoreInjectable from "../workloads-statefulsets/store.injectable";

import type { KubeJsonApiDataFor, KubeObject } from "@freelensapp/kube-object";

import type { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";
import type { DeploymentStore } from "../workloads-deployments/store";
import type { PodStore } from "../workloads-pods/store";

const enabled = process.env.PROLENS_BENCH === "1";

interface Size {
  name: string;
  namespaces: number;
  nodes: number;
  deployments: number;
  /** ReplicaSets per Deployment: the current one plus old revisions without pods. */
  revisions: number;
  podsPerDeployment: number;
  statefulSets: number;
  podsPerStatefulSet: number;
  daemonSets: number;
  jobs: number;
}

const sizes: Size[] = [
  {
    name: "medium",
    namespaces: 50,
    nodes: 50,
    deployments: 1_000,
    revisions: 3,
    podsPerDeployment: 5,
    statefulSets: 200,
    podsPerStatefulSet: 3,
    daemonSets: 10,
    jobs: 500,
  },
  {
    name: "large",
    namespaces: 200,
    nodes: 500,
    deployments: 5_000,
    revisions: 3,
    podsPerDeployment: 5,
    statefulSets: 1_000,
    podsPerStatefulSet: 3,
    daemonSets: 20,
    jobs: 2_000,
  },
];

let uidCounter = 0;
const nextUid = () => `uid-${++uidCounter}`;

const meta = (kind: string, name: string, namespace: string, extra: Record<string, unknown> = {}) => ({
  name,
  namespace,
  uid: nextUid(),
  resourceVersion: "1",
  selfLink: `/apis/${kind}/${namespace}/${name}`,
  ...extra,
});

// One pod in 50 failed and one pending, the rest running.
const phaseOf = (index: number) => (index % 50 === 0 ? "Failed" : index % 50 === 1 ? "Pending" : "Running");

const makePod = (
  name: string,
  namespace: string,
  nodeName: string,
  labels: Record<string, string>,
  owner: { kind: string; name: string; uid: string } | undefined,
  index: number,
) =>
  new Pod({
    apiVersion: "v1",
    kind: "Pod",
    metadata: meta("pods", name, namespace, {
      labels,
      ownerReferences: owner ? [{ apiVersion: "apps/v1", controller: true, ...owner }] : [],
    }),
    spec: { nodeName, containers: [{ name: "main", image: "example" }] },
    status: {
      phase: phaseOf(index),
      conditions: phaseOf(index) === "Running" ? [{ type: "Ready", status: "True" }] : [],
      containerStatuses: [],
    },
  } as unknown as KubeJsonApiDataFor<Pod>);

const generate = (size: Size) => {
  const ns = (i: number) => `ns-${i % size.namespaces}`;
  const node = (i: number) => `node-${i % size.nodes}`;
  const pods: Pod[] = [];
  const deployments: Deployment[] = [];
  const replicaSets: ReplicaSet[] = [];
  const statefulSets: StatefulSet[] = [];
  const daemonSets: DaemonSet[] = [];
  const jobs: Job[] = [];
  let p = 0;

  for (let d = 0; d < size.deployments; d++) {
    const namespace = ns(d);
    const labels = { app: `app-${d}` };
    const template = { metadata: { labels }, spec: { containers: [] } };

    deployments.push(
      new Deployment({
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: meta("deployments", `deploy-${d}`, namespace),
        spec: { replicas: size.podsPerDeployment, selector: { matchLabels: labels }, template },
      } as unknown as KubeJsonApiDataFor<Deployment>),
    );

    for (let r = 0; r < size.revisions; r++) {
      const replicaSet = new ReplicaSet({
        apiVersion: "apps/v1",
        kind: "ReplicaSet",
        metadata: meta("replicasets", `deploy-${d}-rev-${r}`, namespace),
        spec: { replicas: r === 0 ? size.podsPerDeployment : 0, selector: { matchLabels: labels }, template },
      } as unknown as KubeJsonApiDataFor<ReplicaSet>);

      replicaSets.push(replicaSet);

      if (r === 0) {
        for (let i = 0; i < size.podsPerDeployment; i++, p++) {
          pods.push(
            makePod(
              `${replicaSet.getName()}-${i}`,
              namespace,
              node(p),
              labels,
              { kind: "ReplicaSet", name: replicaSet.getName(), uid: replicaSet.getId() },
              p,
            ),
          );
        }
      }
    }
  }

  for (let s = 0; s < size.statefulSets; s++) {
    const namespace = ns(s);
    const statefulSet = new StatefulSet({
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      metadata: meta("statefulsets", `sts-${s}`, namespace),
      spec: { replicas: size.podsPerStatefulSet, template: { metadata: { labels: { sts: `${s}` } } } },
    } as unknown as KubeJsonApiDataFor<StatefulSet>);

    statefulSets.push(statefulSet);

    for (let i = 0; i < size.podsPerStatefulSet; i++, p++) {
      pods.push(
        makePod(
          `sts-${s}-${i}`,
          namespace,
          node(p),
          { sts: `${s}` },
          { kind: "StatefulSet", name: statefulSet.getName(), uid: statefulSet.getId() },
          p,
        ),
      );
    }
  }

  for (let s = 0; s < size.daemonSets; s++) {
    const daemonSet = new DaemonSet({
      apiVersion: "apps/v1",
      kind: "DaemonSet",
      metadata: meta("daemonsets", `ds-${s}`, "kube-system"),
      spec: { template: { metadata: { labels: { ds: `${s}` } } } },
    } as unknown as KubeJsonApiDataFor<DaemonSet>);

    daemonSets.push(daemonSet);

    for (let n = 0; n < size.nodes; n++, p++) {
      pods.push(
        makePod(
          `ds-${s}-${n}`,
          "kube-system",
          `node-${n}`,
          { ds: `${s}` },
          { kind: "DaemonSet", name: daemonSet.getName(), uid: daemonSet.getId() },
          p,
        ),
      );
    }
  }

  for (let j = 0; j < size.jobs; j++) {
    const namespace = ns(j);
    const job = new Job({
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: meta("jobs", `job-${j}`, namespace),
      spec: { template: { metadata: { labels: { job: `${j}` } } } },
    } as unknown as KubeJsonApiDataFor<Job>);

    jobs.push(job);
    pods.push(
      makePod(
        `job-${j}-0`,
        namespace,
        node(p),
        { job: `${j}` },
        { kind: "Job", name: job.getName(), uid: job.getId() },
        p,
      ),
    );
    p++;
  }

  return { pods, deployments, replicaSets, statefulSets, daemonSets, jobs };
};

const createStores = () => {
  const di = getDiForUnitTesting();

  di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
  di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
  di.override(storesAndApisCanBeCreatedInjectable, () => true);
  di.override(
    hostedClusterInjectable,
    () =>
      new Cluster({
        contextName: "some-context-name",
        id: "some-cluster-id",
        kubeConfigPath: "/some-path-to-a-kubeconfig",
      }),
  );

  return {
    podStore: di.inject(podStoreInjectable),
    deploymentStore: di.inject(deploymentStoreInjectable),
    replicaSetStore: di.inject(replicaSetStoreInjectable),
    statefulSetStore: di.inject(statefulSetStoreInjectable),
    daemonSetStore: di.inject(daemonSetStoreInjectable),
    jobStore: di.inject(jobStoreInjectable),
  };
};

/** Median duration of `runs` calls of `fn`, in ms, after one warm-up call unless `warmUp` is false. */
const measure = (fn: () => void, runs: number, warmUp = true) => {
  if (warmUp) fn();
  const durations: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();

    fn();
    durations.push(performance.now() - start);
  }

  durations.sort((a, b) => a - b);

  return durations[Math.floor(durations.length / 2)];
};

type Stores = ReturnType<typeof createStores>;

/*
 * The lookups as they were before the pod indexes (ProLens 1.0.0), copied
 * verbatim, so that one run measures both. They are installed on the store
 * instances, because the stores bind their methods when they are created.
 */
const legacy = {
  getPodsByOwnerId(this: PodStore, workloadId: string) {
    return this.items.filter((pod) => pod.getOwnerRefs().find((owner) => owner.uid === workloadId));
  },
  getPodsByNode(this: PodStore, node: string) {
    if (!this.isLoaded) return [];

    return this.items.filter((pod) => pod.spec.nodeName === node);
  },
  getChildPods(this: DeploymentStore, deployment: Parameters<DeploymentStore["getChildPods"]>[0]) {
    return this.dependencies.podStore
      .getByLabel(deployment.getTemplateLabels())
      .filter((pod) => pod.getNs() === deployment.getNs());
  },
  getAllByNs(this: KubeObjectStore<KubeObject>, namespace: string | string[], strict = false) {
    const namespaces = [namespace].flat();

    if (namespaces.length) {
      return this.items.filter((item) => includes(namespaces, item.getNs()));
    }

    if (!strict) {
      return this.items;
    }

    return [];
  },
};

const savedImplementations = new WeakMap<Stores, Record<string, (...args: never[]) => unknown>>();
const storeNames = [
  "podStore",
  "deploymentStore",
  "replicaSetStore",
  "statefulSetStore",
  "daemonSetStore",
  "jobStore",
] as const;

const useImplementation = (stores: Stores, implementation: "before" | "after") => {
  const target = stores as unknown as Record<string, Record<string, unknown>>;
  let saved = savedImplementations.get(stores);

  if (!saved) {
    saved = {
      getPodsByOwnerId: stores.podStore.getPodsByOwnerId,
      getPodsByNode: stores.podStore.getPodsByNode,
      getChildPods: stores.deploymentStore.getChildPods,
      ...Object.fromEntries(storeNames.map((name) => [`${name}.getAllByNs`, stores[name].getAllByNs])),
    } as Record<string, (...args: never[]) => unknown>;
    savedImplementations.set(stores, saved);
  }

  if (implementation === "before") {
    target.podStore.getPodsByOwnerId = legacy.getPodsByOwnerId.bind(stores.podStore);
    target.podStore.getPodsByNode = legacy.getPodsByNode.bind(stores.podStore);
    target.deploymentStore.getChildPods = legacy.getChildPods.bind(stores.deploymentStore);

    for (const name of storeNames) {
      target[name].getAllByNs = legacy.getAllByNs.bind(stores[name] as unknown as KubeObjectStore<KubeObject>);
    }
  } else {
    target.podStore.getPodsByOwnerId = saved.getPodsByOwnerId;
    target.podStore.getPodsByNode = saved.getPodsByNode;
    target.deploymentStore.getChildPods = saved.getChildPods;

    for (const name of storeNames) {
      target[name].getAllByNs = saved[`${name}.getAllByNs`];
    }
  }
};

const results = new Map<string, { size: string; scenario: string; before?: number; after?: number }>();

describe.skipIf(!enabled)("large cluster benchmarks", () => {
  for (const size of sizes) {
    describe(size.name, () => {
      const data = generate(size);
      const stores = createStores();
      const selectedNamespaces = Array.from({ length: Math.ceil(size.namespaces / 2) }, (_, i) => `ns-${i}`);
      const record = (scenario: string, implementation: "before" | "after", ms: number) => {
        const key = `${size.name}:${scenario}`;
        const entry = results.get(key) ?? { size: size.name, scenario };

        entry[implementation] = ms;
        results.set(key, entry);
      };

      stores.podStore.items = observable.array(data.pods, { deep: false });
      stores.podStore.isLoaded = true;
      stores.deploymentStore.items = observable.array(data.deployments, { deep: false });
      stores.replicaSetStore.items = observable.array(data.replicaSets, { deep: false });
      stores.statefulSetStore.items = observable.array(data.statefulSets, { deep: false });
      stores.daemonSetStore.items = observable.array(data.daemonSets, { deep: false });
      stores.jobStore.items = observable.array(data.jobs, { deep: false });

      const overview = () => ({
        pods: stores.podStore.getStatuses(stores.podStore.getAllByNs(selectedNamespaces)),
        deployments: stores.deploymentStore.getStatuses(stores.deploymentStore.getAllByNs(selectedNamespaces)),
        replicaSets: stores.replicaSetStore.getStatuses(stores.replicaSetStore.getAllByNs(selectedNamespaces)),
        statefulSets: stores.statefulSetStore.getStatuses(stores.statefulSetStore.getAllByNs(selectedNamespaces)),
        daemonSets: stores.daemonSetStore.getStatuses(stores.daemonSetStore.items),
        jobs: stores.jobStore.getStatuses(stores.jobStore.getAllByNs(selectedNamespaces)),
      });

      it(`generates ${data.pods.length} pods and ${data.replicaSets.length} ReplicaSets`, () => {
        expect(data.pods.length).toBeGreaterThan(0);
      });

      it("computes the same overview before and after", () => {
        useImplementation(stores, "before");
        const before = overview();

        useImplementation(stores, "after");
        expect(overview()).toEqual(before);
      });

      for (const implementation of ["before", "after"] as const) {
        // The old lookups are quadratic; at the large size one timed run is all that fits.
        const slow = implementation === "before" && size.name === "large";
        const runs = slow ? 1 : size.name === "large" ? 3 : 7;
        const warmUp = !slow;

        describe(implementation, () => {
          it("workloads overview, recomputed in a reaction after one pod changes", () => {
            useImplementation(stores, implementation);

            let result: ReturnType<typeof overview> | undefined;
            const dispose = autorun(() => {
              result = overview();
            });
            let i = 0;

            const ms = measure(
              () => {
                const index = i++ % data.pods.length;

                runInAction(() => {
                  stores.podStore.items[index] = new Pod(stores.podStore.items[index].toPlainObject() as never);
                });
              },
              runs,
              warmUp,
            );

            dispose();
            const { running = 0, failed = 0, pending = 0 } = result?.deployments ?? {};

            expect(running).toBeGreaterThan(0);
            expect(running + failed + pending).toBe(stores.deploymentStore.getAllByNs(selectedNamespaces).length);
            record("Workloads overview: update after a pod changes", implementation, ms);
          });

          it("ReplicaSet statuses", () => {
            useImplementation(stores, implementation);
            record(
              "ReplicaSet statuses, all namespaces",
              implementation,
              measure(() => stores.replicaSetStore.getStatuses(stores.replicaSetStore.items), runs, warmUp),
            );
          });

          it("pods of 20 nodes", () => {
            useImplementation(stores, implementation);

            const dispose = autorun(() => stores.podStore.getPodsByNode("node-1"));

            record(
              "Pods of a node, 20 lookups",
              implementation,
              measure(
                () => {
                  for (let n = 0; n < 20; n++) stores.podStore.getPodsByNode(`node-${n}`);
                },
                runs,
                warmUp,
              ),
            );
            dispose();
          });

          it("namespace filter of the pod list", () => {
            useImplementation(stores, implementation);
            record(
              "Pods in half of the namespaces",
              implementation,
              measure(() => stores.podStore.getAllByNs(selectedNamespaces), runs, warmUp),
            );
          });
        });
      }

      it("watch flush of 5000 modified pods (code unchanged)", () => {
        const store = stores.podStore as unknown as {
          eventsBuffer: { push: (...events: unknown[]) => void };
          updateFromEventsBuffer: () => void;
        };
        let version = 1;

        record(
          "Watch flush: 5000 MODIFIED events",
          "after",
          measure(
            () => {
              version++;
              const events = data.pods.slice(0, 5_000).map((pod) => ({
                type: "MODIFIED",
                object: { ...pod.toPlainObject(), metadata: { ...pod.metadata, resourceVersion: `${version}` } },
              }));

              store.eventsBuffer.push(...events);
              store.updateFromEventsBuffer();
            },
            size.name === "large" ? 3 : 7,
          ),
        );
      });
    });
  }

  it("prints the results", () => {
    const format = (ms: number | undefined) => (ms === undefined ? "—" : ms.toFixed(1)).padStart(10);
    const lines = [...results.values()].map(({ size, scenario, before, after }) => {
      const speedup = before !== undefined && after !== undefined && after > 0 ? `${Math.round(before / after)}×` : "";

      return `| ${size.padEnd(6)} | ${scenario.padEnd(46)} | ${format(before)} | ${format(after)} | ${speedup.padStart(7)} |`;
    });

    const table = [
      `| size   | ${"scenario".padEnd(46)} | before, ms |  after, ms | speedup |`,
      `| ------ | ${"-".repeat(46)} | ---------: | ---------: | ------: |`,
      ...lines,
    ].join("\n");
    const output = process.env.PROLENS_BENCH_OUT || join(tmpdir(), "prolens-benchmark.md");

    // Vitest hides the console output of passing tests, so the table goes to a file too.
    writeFileSync(output, `${table}\n`);
    console.log(`\n${table}\n\nWritten to ${output}`);
  });
});
