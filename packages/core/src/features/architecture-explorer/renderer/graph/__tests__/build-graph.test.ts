/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { buildArchitectureGraph, nodeId } from "../build-graph";
import { deploymentWithPods, object, resetUids, runningPod, snapshot, template } from "./fixtures";

import type { ArchitectureGraph, GraphEdge, Relation } from "../types";

const id = (kind: string, name: string, namespace: string | undefined = "shop", group = "") =>
  nodeId(group, kind, namespace, name);

const edgesOf = (graph: ArchitectureGraph, relation?: Relation) =>
  graph.edges.filter((edge) => !relation || edge.relation === relation);

const edge = (graph: ArchitectureGraph, relation: Relation, source: string, target: string): GraphEdge | undefined =>
  graph.edges.find(
    (candidate) => candidate.relation === relation && candidate.source === source && candidate.target === target,
  );

describe("buildArchitectureGraph", () => {
  beforeEach(() => resetUids());

  describe("ownership", () => {
    it("links owners to what they own from owner references, as observed", () => {
      const { all } = deploymentWithPods("web");
      const graph = buildArchitectureGraph(snapshot(all));

      expect(
        edge(graph, "owns", id("Deployment", "web", "shop", "apps"), id("ReplicaSet", "web-abc", "shop", "apps")),
      ).toMatchObject({
        provenance: "observed",
      });
      expect(
        edge(graph, "owns", id("ReplicaSet", "web-abc", "shop", "apps"), id("Pod", "web-abc-0"))?.evidence,
      ).toContain("ownerReferences");
    });

    it("shows an owner of a kind ProLens does not load as not loaded, not missing", () => {
      const rollout = object("Rollout", "argoproj.io/v1alpha1", "canary");
      const replicaSet = object("ReplicaSet", "apps/v1", "canary-1", {
        owner: rollout,
        spec: { replicas: 1 },
        status: { readyReplicas: 1 },
      });
      const graph = buildArchitectureGraph(
        snapshot([replicaSet], { coverage: { isLoaded: (_group, kind) => kind !== "Rollout" } }),
      );
      const owner = graph.nodes.get(id("Rollout", "canary", "shop", "argoproj.io"));

      expect(owner).toMatchObject({ placeholder: "not-loaded", health: "unknown" });
      expect(
        edge(graph, "owns", owner?.id ?? "", id("ReplicaSet", "canary-1", "shop", "apps"))?.broken,
      ).toBeUndefined();
    });

    it("links a pod to the node it runs on", () => {
      const node = object("Node", "v1", "node-1", {
        namespace: null,
        status: { conditions: [{ type: "Ready", status: "True" }] },
      });
      const { all } = deploymentWithPods("web", { pods: 1 });
      const graph = buildArchitectureGraph(snapshot([node, ...all]));

      expect(edge(graph, "runs-on", id("Pod", "web-abc-0"), id("Node", "node-1", undefined))).toMatchObject({
        provenance: "observed",
        evidence: "spec.nodeName",
      });
    });
  });

  describe("references of pod templates", () => {
    it("records them once, on the topmost controller, not on every pod", () => {
      const configMap = object("ConfigMap", "v1", "settings");
      const { all } = deploymentWithPods("web", {
        podSpec: { volumes: [{ name: "config", configMap: { name: "settings" } }] },
        pods: 3,
      });
      const graph = buildArchitectureGraph(snapshot([configMap, ...all]));
      const mounts = edgesOf(graph, "mounts");

      expect(mounts).toHaveLength(1);
      expect(mounts[0]).toMatchObject({
        source: id("Deployment", "web", "shop", "apps"),
        target: id("ConfigMap", "settings"),
        provenance: "referenced",
        evidence: "volume config",
      });
    });

    it("finds ConfigMaps and Secrets in volumes, projected volumes, env, envFrom and pull secrets", () => {
      const pod = object("Pod", "v1", "standalone", {
        spec: {
          volumes: [
            { name: "a", configMap: { name: "cm-volume" } },
            { name: "b", secret: { secretName: "secret-volume" } },
            {
              name: "c",
              projected: {
                sources: [{ configMap: { name: "cm-projected" } }, { secret: { name: "secret-projected" } }],
              },
            },
          ],
          containers: [
            {
              name: "app",
              env: [
                { name: "A", valueFrom: { configMapKeyRef: { name: "cm-key", key: "a" } } },
                { name: "B", valueFrom: { secretKeyRef: { name: "secret-key", key: "b" } } },
              ],
              envFrom: [{ configMapRef: { name: "cm-from" } }, { secretRef: { name: "secret-from" } }],
            },
          ],
          initContainers: [{ name: "init", envFrom: [{ configMapRef: { name: "cm-init" } }] }],
          imagePullSecrets: [{ name: "registry" }],
          serviceAccountName: "runner",
        },
        status: runningPod,
      });
      const graph = buildArchitectureGraph(snapshot([pod]));
      const source = id("Pod", "standalone");
      const targets = (relation: Relation) =>
        edgesOf(graph, relation)
          .filter((candidate) => candidate.source === source)
          .map((candidate) => graph.nodes.get(candidate.target)?.name)
          .sort();

      expect(targets("mounts")).toEqual(["cm-projected", "cm-volume", "secret-projected", "secret-volume"]);
      expect(targets("env")).toEqual(["cm-from", "cm-init", "cm-key", "secret-from", "secret-key"]);
      expect(targets("pull-secret")).toEqual(["registry"]);
      expect(targets("service-account")).toEqual(["runner"]);
    });

    it("infers the default ServiceAccount when none is named", () => {
      const pod = object("Pod", "v1", "plain", { spec: { containers: [{ name: "app" }] }, status: runningPod });
      const graph = buildArchitectureGraph(snapshot([pod, object("ServiceAccount", "v1", "default")]));

      expect(edge(graph, "service-account", id("Pod", "plain"), id("ServiceAccount", "default"))).toMatchObject({
        provenance: "inferred",
      });
    });

    it("marks a missing ConfigMap as missing and its workload as critical", () => {
      const { all } = deploymentWithPods("web", {
        podSpec: { volumes: [{ name: "config", configMap: { name: "gone" } }] },
      });
      const graph = buildArchitectureGraph(snapshot(all));
      const missing = graph.nodes.get(id("ConfigMap", "gone"));
      const deployment = graph.nodes.get(id("Deployment", "web", "shop", "apps"));

      expect(missing).toMatchObject({ placeholder: "missing", health: "missing" });
      expect(missing?.reasons.join(" ")).toContain("Referenced by Deployment web");
      expect(edge(graph, "mounts", deployment?.id ?? "", missing?.id ?? "")?.broken).toBe(true);
      expect(deployment).toMatchObject({ health: "critical" });
      expect(deployment?.reasons).toContain("ConfigMap gone (volume) does not exist");
    });

    it("does not treat a missing optional reference as a problem", () => {
      const pod = object("Pod", "v1", "p", {
        spec: { containers: [{ name: "app", envFrom: [{ configMapRef: { name: "maybe", optional: true } }] }] },
        status: runningPod,
      });
      const graph = buildArchitectureGraph(snapshot([pod, object("ServiceAccount", "v1", "default")]));

      expect(graph.nodes.get(id("ConfigMap", "maybe"))).toMatchObject({ health: "unknown" });
      expect(graph.nodes.get(id("Pod", "p"))?.health).toBe("healthy");
    });

    it("cannot call a reference missing when its kind or namespace is not loaded", () => {
      const pod = object("Pod", "v1", "p", {
        spec: { containers: [{ name: "app", envFrom: [{ secretRef: { name: "creds" } }] }] },
        status: runningPod,
      });
      const graph = buildArchitectureGraph(
        snapshot([pod], { coverage: { isLoaded: (_group, kind) => kind !== "Secret" } }),
      );

      expect(graph.nodes.get(id("Secret", "creds"))).toMatchObject({ placeholder: "unverified", health: "unknown" });
      expect(edge(graph, "env", id("Pod", "p"), id("Secret", "creds"))?.broken).toBeUndefined();
    });

    it("links each StatefulSet pod to its own claim from the claim templates", () => {
      const labels = { app: "db" };
      const statefulSet = object("StatefulSet", "apps/v1", "db", {
        spec: { replicas: 2, ...template(labels), volumeClaimTemplates: [{ metadata: { name: "data" } }] },
        status: { readyReplicas: 2 },
      });
      const pods = [0, 1].map((index) =>
        object("Pod", "v1", `db-${index}`, {
          labels,
          owner: statefulSet,
          spec: {
            containers: [{ name: "app" }],
            volumes: [{ name: "data", persistentVolumeClaim: { claimName: `data-db-${index}` } }],
          },
          status: runningPod,
        }),
      );
      const claims = [0, 1].map((index) =>
        object("PersistentVolumeClaim", "v1", `data-db-${index}`, { status: { phase: "Bound" } }),
      );
      const graph = buildArchitectureGraph(snapshot([statefulSet, ...pods, ...claims]));

      expect(edge(graph, "mounts", id("Pod", "db-0"), id("PersistentVolumeClaim", "data-db-0"))).toBeDefined();
      expect(edge(graph, "mounts", id("Pod", "db-1"), id("PersistentVolumeClaim", "data-db-1"))).toBeDefined();
      expect(edge(graph, "mounts", id("Pod", "db-0"), id("PersistentVolumeClaim", "data-db-1"))).toBeUndefined();
    });
  });

  describe("Services", () => {
    const service = (selector: Record<string, string>, name = "web") =>
      object("Service", "v1", name, { spec: { type: "ClusterIP", selector } });
    const slice = (service: string, endpoints: { pod: string; ready: boolean }[]) =>
      object("EndpointSlice", "discovery.k8s.io/v1", `${service}-xyz`, {
        labels: { "kubernetes.io/service-name": service },
        extra: {
          endpoints: endpoints.map(({ pod, ready }) => ({
            addresses: ["10.0.0.1"],
            conditions: { ready },
            targetRef: { kind: "Pod", name: pod, namespace: "shop" },
          })),
        },
      });

    it("observes the pods an EndpointSlice lists, and only infers the others", () => {
      const { all } = deploymentWithPods("web", { pods: 2 });
      const graph = buildArchitectureGraph(
        snapshot([...all, service({ app: "web" }), slice("web", [{ pod: "web-abc-0", ready: true }])]),
      );
      const svc = id("Service", "web");

      expect(edge(graph, "selects", svc, id("Pod", "web-abc-0"))).toMatchObject({ provenance: "observed" });
      expect(edge(graph, "selects", svc, id("Pod", "web-abc-1"))).toMatchObject({ provenance: "inferred" });
      expect(edge(graph, "selects", svc, id("Pod", "web-abc-1"))?.evidence).toContain("no EndpointSlice lists it");
      expect(edge(graph, "endpoints", svc, id("EndpointSlice", "web-xyz", "shop", "discovery.k8s.io"))).toMatchObject({
        provenance: "observed",
      });
    });

    it("is critical when its selector matches no pods", () => {
      const { all } = deploymentWithPods("web");
      const graph = buildArchitectureGraph(snapshot([...all, service({ app: "wbe" }, "typo")]));
      const node = graph.nodes.get(id("Service", "typo"));

      expect(node?.health).toBe("critical");
      expect(node?.reasons.join()).toContain("Selector app=wbe matches no pods in namespace shop");
    });

    it("is critical when no selected pod is a ready endpoint", () => {
      const { all } = deploymentWithPods("web", { pods: 1 });
      const graph = buildArchitectureGraph(
        snapshot([...all, service({ app: "web" }), slice("web", [{ pod: "web-abc-0", ready: false }])]),
      );

      expect(graph.nodes.get(id("Service", "web"))?.reasons.join()).toContain(
        "No ready endpoints: 1 pod selected, none ready",
      );
    });

    it("matches selectors only within the Service's namespace", () => {
      const other = deploymentWithPods("web", { namespace: "other" });
      const graph = buildArchitectureGraph(snapshot([...other.all, service({ app: "web" })]));

      expect(edgesOf(graph, "selects")).toHaveLength(0);
    });
  });

  describe("Ingresses and the Gateway API", () => {
    it("routes an Ingress to its backend Services and its class, and flags a missing backend", () => {
      const ingress = object("Ingress", "networking.k8s.io/v1", "shop", {
        spec: {
          ingressClassName: "nginx",
          rules: [
            {
              host: "shop.example",
              http: {
                paths: [
                  { path: "/", backend: { service: { name: "web", port: { number: 80 } } } },
                  { path: "/api", backend: { service: { name: "api", port: { name: "http" } } } },
                ],
              },
            },
          ],
        },
      });
      const graph = buildArchitectureGraph(
        snapshot([
          ingress,
          object("Service", "v1", "web", { spec: {} }),
          object("IngressClass", "networking.k8s.io/v1", "nginx", { namespace: null }),
        ]),
      );
      const source = id("Ingress", "shop", "shop", "networking.k8s.io");

      expect(edge(graph, "routes-to", source, id("Service", "web"))).toMatchObject({
        evidence: "shop.example/ → web:80",
        provenance: "referenced",
      });
      expect(edge(graph, "routes-to", source, id("Service", "api"))?.broken).toBe(true);
      expect(edge(graph, "class", source, id("IngressClass", "nginx", undefined, "networking.k8s.io"))).toBeDefined();
      expect(graph.nodes.get(source)?.health).toBe("critical");
    });

    it("observes a route accepted by its gateway, and links it to its backends", () => {
      const gateway = object("Gateway", "gateway.networking.k8s.io/v1", "public", {
        spec: { gatewayClassName: "cilium" },
        status: {
          conditions: [
            { type: "Accepted", status: "True" },
            { type: "Programmed", status: "True" },
          ],
        },
      });
      const route = object("HTTPRoute", "gateway.networking.k8s.io/v1", "web", {
        spec: {
          parentRefs: [{ name: "public" }],
          rules: [
            {
              backendRefs: [
                { name: "web", port: 80 },
                { name: "api", namespace: "backend", port: 8080 },
              ],
            },
          ],
        },
        status: {
          parents: [
            {
              parentRef: { name: "public" },
              conditions: [
                { type: "Accepted", status: "True" },
                { type: "ResolvedRefs", status: "True" },
              ],
            },
          ],
        },
      });
      const graph = buildArchitectureGraph(
        snapshot([
          gateway,
          route,
          object("Service", "v1", "web", { spec: {} }),
          object("Service", "v1", "api", { namespace: "backend", spec: {} }),
        ]),
      );
      const routeId = id("HTTPRoute", "web", "shop", "gateway.networking.k8s.io");
      const gatewayId = id("Gateway", "public", "shop", "gateway.networking.k8s.io");

      expect(edge(graph, "attaches", gatewayId, routeId)).toMatchObject({ provenance: "observed" });
      expect(edge(graph, "routes-to", routeId, id("Service", "web"))).toBeDefined();
      expect(edge(graph, "routes-to", routeId, id("Service", "api", "backend"))?.evidence).toContain("ReferenceGrant");
      expect(
        edge(graph, "class", gatewayId, id("GatewayClass", "cilium", undefined, "gateway.networking.k8s.io")),
      ).toBeDefined();
      expect(graph.nodes.get(routeId)?.health).toBe("healthy");
    });

    it("marks a route its gateway rejected as broken", () => {
      const gateway = object("Gateway", "gateway.networking.k8s.io/v1", "public", { spec: { gatewayClassName: "x" } });
      const route = object("HTTPRoute", "gateway.networking.k8s.io/v1", "web", {
        spec: { parentRefs: [{ name: "public" }] },
        status: {
          parents: [
            {
              parentRef: { name: "public" },
              conditions: [{ type: "Accepted", status: "False", reason: "NotAllowedByListeners" }],
            },
          ],
        },
      });
      const graph = buildArchitectureGraph(snapshot([gateway, route]));
      const attach = edge(
        graph,
        "attaches",
        id("Gateway", "public", "shop", "gateway.networking.k8s.io"),
        id("HTTPRoute", "web", "shop", "gateway.networking.k8s.io"),
      );

      expect(attach).toMatchObject({ broken: true, provenance: "referenced" });
      expect(graph.nodes.get(id("HTTPRoute", "web", "shop", "gateway.networking.k8s.io"))?.health).toBe("critical");
    });
  });

  describe("network policies", () => {
    it("applies a policy to the pods it selects in its namespace and describes its rules", () => {
      const web = deploymentWithPods("web", { pods: 1 });
      const db = deploymentWithPods("db", { pods: 1 });
      const policy = object("NetworkPolicy", "networking.k8s.io/v1", "db-only-from-web", {
        spec: {
          podSelector: { matchExpressions: [{ key: "app", operator: "In", values: ["db"] }] },
          policyTypes: ["Ingress"],
          ingress: [
            { from: [{ podSelector: { matchLabels: { app: "web" } } }], ports: [{ protocol: "TCP", port: 5432 }] },
          ],
        },
      });
      const graph = buildArchitectureGraph(snapshot([...web.all, ...db.all, policy]));
      const policyId = id("NetworkPolicy", "db-only-from-web", "shop", "networking.k8s.io");

      expect(edgesOf(graph, "applies-to").map((candidate) => candidate.target)).toEqual([id("Pod", "db-abc-0")]);
      expect(graph.nodes.get(policyId)?.details).toEqual(["Ingress allowed from pods app=web on TCP/5432"]);
    });

    it("says when a policy denies all ingress", () => {
      const web = deploymentWithPods("web", { pods: 1 });
      const policy = object("NetworkPolicy", "networking.k8s.io/v1", "deny", {
        spec: { podSelector: {}, policyTypes: ["Ingress"] },
      });
      const graph = buildArchitectureGraph(snapshot([...web.all, policy]));

      expect(graph.nodes.get(id("Pod", "web-abc-0"))?.details).toContain(
        "NetworkPolicy deny: Ingress: all traffic denied",
      );
    });

    it("applies Cilium policies by endpoint selector, with Cilium's key prefixes", () => {
      const web = deploymentWithPods("web", { pods: 1 });
      const policy = object("CiliumNetworkPolicy", "cilium.io/v2", "web", {
        spec: { endpointSelector: { matchLabels: { "k8s:app": "web" } } },
      });
      const clusterwide = object("CiliumClusterwideNetworkPolicy", "cilium.io/v2", "all-shop", {
        namespace: null,
        spec: { endpointSelector: { matchLabels: { "k8s:io.kubernetes.pod.namespace": "shop" } } },
      });
      const graph = buildArchitectureGraph(snapshot([...web.all, policy, clusterwide]));

      expect(
        edgesOf(graph, "applies-to")
          .map((candidate) => graph.nodes.get(candidate.source)?.name)
          .sort(),
      ).toEqual(["all-shop", "web"]);
    });
  });

  describe("storage", () => {
    it("links claims to volumes and storage classes, observed when bound", () => {
      const claim = object("PersistentVolumeClaim", "v1", "data", {
        spec: { volumeName: "pv-1", storageClassName: "fast" },
        status: { phase: "Bound" },
      });
      const volume = object("PersistentVolume", "v1", "pv-1", {
        namespace: null,
        spec: { storageClassName: "fast", claimRef: { name: "data", namespace: "shop" } },
        status: { phase: "Bound" },
      });
      const storageClass = object("StorageClass", "storage.k8s.io/v1", "fast", { namespace: null });
      const graph = buildArchitectureGraph(snapshot([claim, volume, storageClass]));
      const claimId = id("PersistentVolumeClaim", "data");
      const volumeId = id("PersistentVolume", "pv-1", undefined);

      expect(edge(graph, "binds", claimId, volumeId)).toMatchObject({ provenance: "observed" });
      expect(edgesOf(graph, "binds")).toHaveLength(1);
      expect(edge(graph, "class", claimId, id("StorageClass", "fast", undefined, "storage.k8s.io"))).toBeDefined();
      expect(edge(graph, "class", volumeId, id("StorageClass", "fast", undefined, "storage.k8s.io"))).toBeDefined();
    });

    it("infers the default storage class for a claim that names none", () => {
      const claim = object("PersistentVolumeClaim", "v1", "data", { spec: {}, status: { phase: "Pending" } });
      const storageClass = object("StorageClass", "storage.k8s.io/v1", "standard", {
        namespace: null,
        annotations: { "storageclass.kubernetes.io/is-default-class": "true" },
      });
      const graph = buildArchitectureGraph(snapshot([claim, storageClass]));

      expect(
        edge(
          graph,
          "class",
          id("PersistentVolumeClaim", "data"),
          id("StorageClass", "standard", undefined, "storage.k8s.io"),
        ),
      ).toMatchObject({
        provenance: "inferred",
      });
      expect(graph.nodes.get(id("PersistentVolumeClaim", "data"))?.health).toBe("warning");
    });
  });

  it("attaches recent warning events to the objects they are about", () => {
    const { pods, all } = deploymentWithPods("web", { pods: 1 });
    const graph = buildArchitectureGraph(
      snapshot(all, {
        events: [
          {
            type: "Warning",
            reason: "BackOff",
            message: "Back-off restarting",
            count: 12,
            lastTimestamp: "2026-11-16T10:00:00Z",
            involvedObject: { uid: pods[0].metadata.uid },
          },
          { type: "Normal", reason: "Pulled", message: "ok", involvedObject: { uid: pods[0].metadata.uid } },
        ],
      }),
    );

    expect(graph.nodes.get(id("Pod", "web-abc-0"))?.warningEvents).toEqual([
      { reason: "BackOff", message: "Back-off restarting", count: 12, lastSeen: "2026-11-16T10:00:00Z" },
    ]);
  });

  it("gives every node a stable id across rebuilds", () => {
    const first = buildArchitectureGraph(snapshot(deploymentWithPods("web").all));

    resetUids();

    const second = buildArchitectureGraph(snapshot(deploymentWithPods("web").all));

    expect([...second.nodes.keys()]).toEqual([...first.nodes.keys()]);
    expect(second.edges.map((candidate) => candidate.id)).toEqual(first.edges.map((candidate) => candidate.id));
  });
});
