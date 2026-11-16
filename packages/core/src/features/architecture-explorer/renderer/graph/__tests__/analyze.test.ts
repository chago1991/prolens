/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { analyze } from "../analyze";
import { buildArchitectureGraph, nodeId } from "../build-graph";
import { assessHealth } from "../health";
import { deploymentWithPods, object, resetUids, runningPod, snapshot } from "./fixtures";

const id = (kind: string, name: string, namespace: string | undefined = "shop", group = "") =>
  nodeId(group, kind, namespace, name);
const deploymentId = (name: string) => id("Deployment", name, "shop", "apps");
const readyNode = (name: string) =>
  object("Node", "v1", name, { namespace: null, status: { conditions: [{ type: "Ready", status: "True" }] } });
const service = (name: string, selector: Record<string, string>) =>
  object("Service", "v1", name, { spec: { selector } });

const crashLooping = {
  phase: "Running",
  conditions: [{ type: "Ready", status: "False" }],
  containerStatuses: [
    {
      name: "app",
      ready: false,
      restartCount: 7,
      state: { waiting: { reason: "CrashLoopBackOff", message: "back-off 5m0s restarting failed container" } },
      lastState: { terminated: { reason: "Error", exitCode: 1 } },
    },
  ],
};

describe("assessHealth", () => {
  it("reads why a pod does not run from its containers and conditions", () => {
    expect(assessHealth(object("Pod", "v1", "p", { status: crashLooping }))).toMatchObject({
      health: "critical",
      reasons: [
        expect.stringContaining(
          "CrashLoopBackOff: back-off 5m0s restarting failed container (last exit: Error, code 1)",
        ),
      ],
    });
    expect(
      assessHealth(
        object("Pod", "v1", "p", {
          status: {
            phase: "Pending",
            conditions: [
              { type: "PodScheduled", status: "False", reason: "Unschedulable", message: "0/3 nodes are available" },
            ],
          },
        }),
      ),
    ).toMatchObject({ health: "critical", reasons: ["Not scheduled (Unschedulable): 0/3 nodes are available"] });
    expect(assessHealth(object("Pod", "v1", "p", { status: { phase: "Succeeded" } })).health).toBe("healthy");
    expect(assessHealth(object("Pod", "v1", "p", { status: { phase: "Failed", reason: "Evicted" } })).health).toBe(
      "warning",
    );
  });

  it("reads workload health from available or ready replicas", () => {
    const deployment = (available: number) =>
      object("Deployment", "apps/v1", "d", { spec: { replicas: 3 }, status: { availableReplicas: available } });

    expect(assessHealth(deployment(3))).toMatchObject({ health: "healthy", status: "3/3 available" });
    expect(assessHealth(deployment(1))).toMatchObject({ health: "warning", reasons: ["1/3 replicas available"] });
    expect(assessHealth(deployment(0))).toMatchObject({ health: "critical", reasons: ["No replica available (0/3)"] });
    expect(assessHealth(object("Deployment", "apps/v1", "zero", { spec: { replicas: 0 }, status: {} }))).toMatchObject({
      health: "healthy",
    });
  });

  it("flags a node that is not ready, under pressure or cordoned", () => {
    expect(
      assessHealth(
        object("Node", "v1", "n", {
          status: {
            conditions: [{ type: "Ready", status: "Unknown", message: "Kubelet stopped posting node status" }],
          },
        }),
      ),
    ).toMatchObject({
      health: "critical",
    });
    expect(
      assessHealth(
        object("Node", "v1", "n", {
          spec: { unschedulable: true },
          status: {
            conditions: [
              { type: "Ready", status: "True" },
              { type: "DiskPressure", status: "True" },
            ],
          },
        }),
      ).reasons,
    ).toEqual(["DiskPressure is True", "Cordoned: new pods are not scheduled here"]);
  });
});

describe("analyze", () => {
  beforeEach(() => resetUids());

  it("finds a crash-looping pod as the root cause of an unreachable Service", () => {
    const web = deploymentWithPods("web", { pods: 1, podStatus: crashLooping });
    const graph = buildArchitectureGraph(snapshot([readyNode("node-1"), ...web.all, service("web", { app: "web" })]));
    const analysis = analyze(graph, id("Service", "web"));
    const roots = analysis.findings.filter((finding) => finding.rootCause);

    expect(roots.map((finding) => finding.nodeId)).toEqual([id("Pod", "web-abc-0")]);
    expect(roots[0].path).toEqual([id("Service", "web"), id("Pod", "web-abc-0")]);
    expect(roots[0].evidence.join()).toContain("CrashLoopBackOff");
    expect(analysis.findings.find((finding) => finding.nodeId === id("Service", "web"))?.rootCause).toBe(false);
  });

  it("follows a pod to the ConfigMap its Deployment's template needs", () => {
    const web = deploymentWithPods("web", {
      pods: 2,
      podSpec: { volumes: [{ name: "config", configMap: { name: "settings" } }] },
      podStatus: {
        phase: "Pending",
        containerStatuses: [
          {
            name: "app",
            ready: false,
            state: { waiting: { reason: "CreateContainerConfigError", message: 'configmap "settings" not found' } },
          },
        ],
      },
    });
    const graph = buildArchitectureGraph(snapshot([readyNode("node-1"), ...web.all]));
    const analysis = analyze(graph, id("Pod", "web-abc-0"));
    const roots = analysis.findings.filter((finding) => finding.rootCause).map((finding) => finding.nodeId);

    expect(roots).toEqual([id("ConfigMap", "settings")]);
    expect(analysis.dependencies.has(deploymentId("web"))).toBe(true);
    // The other pod of the same Deployment is not a dependency of this one.
    expect(analysis.dependencies.has(id("Pod", "web-abc-1"))).toBe(false);
  });

  it("finds a node that is not ready as the root cause of its pods' problems", () => {
    const notReady = object("Node", "v1", "node-1", {
      namespace: null,
      status: { conditions: [{ type: "Ready", status: "False" }] },
    });
    const web = deploymentWithPods("web", {
      pods: 1,
      podStatus: { phase: "Running", conditions: [{ type: "Ready", status: "False" }] },
    });
    const graph = buildArchitectureGraph(snapshot([notReady, ...web.all]));
    const analysis = analyze(graph, deploymentId("web"));

    expect(analysis.findings.filter((finding) => finding.rootCause).map((finding) => finding.nodeId)).toEqual([
      id("Node", "node-1", undefined),
    ]);
  });

  it("finds a Service whose selector matches nothing as its own root cause", () => {
    const web = deploymentWithPods("web", { pods: 1 });
    const graph = buildArchitectureGraph(snapshot([readyNode("node-1"), ...web.all, service("typo", { app: "wbe" })]));
    const analysis = analyze(graph, id("Service", "typo"));

    expect(analysis.findings).toHaveLength(1);
    expect(analysis.findings[0]).toMatchObject({ nodeId: id("Service", "typo"), rootCause: true });
  });

  it("reports nothing for a healthy application", () => {
    const web = deploymentWithPods("web", { pods: 2 });
    // Without EndpointSlices, readiness comes from the pods' Ready condition.
    const graph = buildArchitectureGraph(
      snapshot(
        [readyNode("node-1"), ...web.all, service("web", { app: "web" }), object("ServiceAccount", "v1", "default")],
        {
          coverage: { isLoaded: (_group, kind) => kind !== "EndpointSlice" },
        },
      ),
    );

    expect(analyze(graph, id("Service", "web")).findings).toEqual([]);
  });

  it("lists what a change of a ConfigMap would affect, up to the Ingress", () => {
    const web = deploymentWithPods("web", {
      pods: 2,
      podSpec: { volumes: [{ name: "config", configMap: { name: "settings" } }] },
    });
    const ingress = object("Ingress", "networking.k8s.io/v1", "public", {
      spec: { rules: [{ http: { paths: [{ backend: { service: { name: "web", port: { number: 80 } } } }] } }] },
    });
    const graph = buildArchitectureGraph(
      snapshot([
        object("ConfigMap", "v1", "settings"),
        readyNode("node-1"),
        ...web.all,
        service("web", { app: "web" }),
        ingress,
      ]),
    );
    const impact = analyze(graph, id("ConfigMap", "settings")).impact;

    expect([...impact].sort()).toEqual(
      [
        id("ConfigMap", "settings"),
        deploymentId("web"),
        id("ReplicaSet", "web-abc", "shop", "apps"),
        id("Pod", "web-abc-0"),
        id("Pod", "web-abc-1"),
        id("Service", "web"),
        id("Ingress", "public", "shop", "networking.k8s.io"),
      ].sort(),
    );
  });

  it("notes a network policy that denies all ingress to a dependency", () => {
    const web = deploymentWithPods("web", { pods: 1 });
    const policy = object("NetworkPolicy", "networking.k8s.io/v1", "deny-all", {
      spec: { podSelector: {}, policyTypes: ["Ingress"] },
    });
    const graph = buildArchitectureGraph(
      snapshot([readyNode("node-1"), ...web.all, service("web", { app: "web" }), policy]),
    );

    expect(analyze(graph, id("Service", "web")).networkNotes).toEqual([
      {
        policyId: id("NetworkPolicy", "deny-all", "shop", "networking.k8s.io"),
        podId: id("Pod", "web-abc-0"),
        note: "NetworkPolicy deny-all: Ingress: all traffic denied",
      },
    ]);
  });

  it("does not loop on cycles", () => {
    const a = object("Pod", "v1", "a", { spec: { nodeName: "n" }, status: runningPod });
    const graph = buildArchitectureGraph(snapshot([a, readyNode("n")]));

    expect(() => analyze(graph, id("Pod", "a"))).not.toThrow();
  });
});
