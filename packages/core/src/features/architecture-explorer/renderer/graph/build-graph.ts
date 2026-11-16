/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { assessHealth, worse } from "./health";
import { describeSelector, isEmptySelector, LabelIndex, matchesSelector } from "./label-selector";

import type { Selector } from "./label-selector";
import type {
  ArchitectureGraph,
  ClusterSnapshot,
  GraphEdge,
  GraphEvent,
  GraphNode,
  Provenance,
  Relation,
  ResourceEvent,
  ResourceObject,
} from "./types";

export const gatewayApiGroup = "gateway.networking.k8s.io";
export const ciliumGroup = "cilium.io";

/** The kinds that are not namespaced, so that a reference to them has no namespace. */
const clusterScopedKinds = new Set([
  "Node",
  "PersistentVolume",
  "StorageClass",
  "IngressClass",
  "GatewayClass",
  "Namespace",
  "CiliumClusterwideNetworkPolicy",
]);

const routeKinds = new Set(["HTTPRoute", "GRPCRoute", "TLSRoute", "TCPRoute", "UDPRoute"]);

/** The API group of an `apiVersion`: empty for the core group. */
export const groupOf = (apiVersion: string): string => (apiVersion.includes("/") ? apiVersion.split("/")[0] : "");

export const nodeId = (group: string, kind: string, namespace: string | undefined, name: string): string =>
  `${group}/${kind}/${clusterScopedKinds.has(kind) ? "" : (namespace ?? "")}/${name}`;

const idOf = (object: ResourceObject) =>
  nodeId(groupOf(object.apiVersion), object.kind, object.metadata.namespace, object.metadata.name);

type MutableNode = {
  -readonly [K in keyof GraphNode]: GraphNode[K];
};

interface Volume {
  name?: string;
  configMap?: { name?: string; optional?: boolean };
  secret?: { secretName?: string; optional?: boolean };
  persistentVolumeClaim?: { claimName?: string };
  ephemeral?: unknown;
  projected?: {
    sources?: {
      configMap?: { name?: string; optional?: boolean };
      secret?: { name?: string; optional?: boolean };
    }[];
  };
}

interface KeyRef {
  name?: string;
  key?: string;
  optional?: boolean;
}

interface Container {
  name?: string;
  env?: { name?: string; valueFrom?: { configMapKeyRef?: KeyRef; secretKeyRef?: KeyRef } }[];
  envFrom?: { configMapRef?: KeyRef; secretRef?: KeyRef }[];
}

interface PodSpec {
  nodeName?: string;
  serviceAccountName?: string;
  serviceAccount?: string;
  volumes?: Volume[];
  containers?: Container[];
  initContainers?: Container[];
  ephemeralContainers?: Container[];
  imagePullSecrets?: { name?: string }[];
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const array = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const str = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

/** The pod template of a workload, or the spec of a pod. */
export const podSpecOf = (object: ResourceObject): PodSpec | undefined => {
  const spec = record(object.spec);

  switch (object.kind) {
    case "Pod":
      return spec as PodSpec;
    case "Deployment":
    case "StatefulSet":
    case "DaemonSet":
    case "ReplicaSet":
    case "ReplicationController":
    case "Job":
      return record(record(spec.template).spec) as PodSpec;
    case "CronJob":
      return record(record(record(record(spec.jobTemplate).spec).template).spec) as PodSpec;
    default:
      return undefined;
  }
};

const relationText: Record<Relation, string> = {
  owns: "owner",
  "runs-on": "node",
  selects: "pod",
  endpoints: "EndpointSlice",
  "routes-to": "backend",
  attaches: "parent gateway",
  class: "class",
  mounts: "volume",
  env: "environment source",
  "service-account": "service account",
  "pull-secret": "image pull secret",
  binds: "volume",
  "applies-to": "policy",
};

const provenanceStrength: Record<Provenance, number> = { inferred: 0, referenced: 1, observed: 2 };

const eventKey = (kind = "", namespace = "", name = "") => `${kind}/${namespace}/${name}`;

const maxEventsPerNode = 5;

const summarizeEvents = (events: ResourceEvent[]): GraphEvent[] =>
  events
    .map((event) => ({
      reason: event.reason ?? "Warning",
      message: event.message ?? "",
      count: event.count ?? 1,
      lastSeen: event.lastTimestamp ?? event.eventTime,
    }))
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""))
    .slice(0, maxEventsPerNode);

class GraphBuilder {
  readonly nodes = new Map<string, MutableNode>();
  private readonly edges = new Map<string, GraphEdge & { evidenceLines: string[] }>();
  private readonly byUid = new Map<string, string>();
  private readonly objects = new Map<string, ResourceObject>();
  private readonly optionalOnly = new Set<string>();

  constructor(private readonly snapshot: ClusterSnapshot) {}

  addObject(object: ResourceObject) {
    const id = idOf(object);
    const assessment = assessHealth(object);

    this.objects.set(id, object);

    if (object.metadata.uid) {
      this.byUid.set(object.metadata.uid, id);
    }

    this.nodes.set(id, {
      id,
      kind: object.kind,
      group: groupOf(object.apiVersion),
      apiVersion: object.apiVersion,
      name: object.metadata.name,
      namespace: clusterScopedKinds.has(object.kind) ? undefined : object.metadata.namespace,
      uid: object.metadata.uid,
      selfLink: object.metadata.selfLink,
      labels: (object.metadata.labels ?? {}) as Record<string, string>,
      health: assessment.health,
      reasons: assessment.reasons,
      status: assessment.status,
      nodeName: object.kind === "Pod" ? str(record(object.spec).nodeName) : undefined,
      details: [],
      warningEvents: [],
    });
  }

  object(id: string) {
    return this.objects.get(id);
  }

  idForUid(uid: string) {
    return this.byUid.get(uid);
  }

  node(id: string) {
    return this.nodes.get(id);
  }

  /**
   * The node for a reference, created as a placeholder when the cluster does
   * not have the object. A placeholder is `missing` only when its kind and
   * namespace were loaded; otherwise ProLens cannot know.
   */
  target(apiVersion: string, kind: string, namespace: string | undefined, name: string, optional = false): string {
    const group = groupOf(apiVersion);
    const id = nodeId(group, kind, namespace, name);
    const existing = this.nodes.get(id);

    if (existing) {
      if (existing.placeholder === "missing" && !optional && this.optionalOnly.has(id)) {
        this.optionalOnly.delete(id);
        existing.health = "missing";
        existing.reasons = ["Does not exist", ...existing.reasons.filter((reason) => !reason.startsWith("Optional"))];
      }

      return id;
    }

    const ns = clusterScopedKinds.has(kind) ? undefined : namespace;
    const known = this.snapshot.coverage.isLoaded(group, kind, ns);
    const placeholder = known ? "missing" : "unverified";

    if (known && optional) {
      this.optionalOnly.add(id);
    }

    this.nodes.set(id, {
      id,
      kind,
      group,
      apiVersion,
      name,
      namespace: ns,
      labels: {},
      health: known ? (optional ? "unknown" : "missing") : "unknown",
      reasons: known
        ? [optional ? "Optional reference; does not exist" : "Does not exist"]
        : [`Not loaded: ProLens cannot check that this ${kind} exists (no access, or its namespace is not selected)`],
      placeholder,
      details: [],
      warningEvents: [],
    });

    return id;
  }

  edge(
    source: string,
    target: string,
    relation: Relation,
    provenance: Provenance,
    evidence: string,
    { optional = false, broken }: { optional?: boolean; broken?: boolean } = {},
  ) {
    if (source === target) {
      return;
    }

    const id = `${relation}|${source}|${target}`;
    const targetNode = this.nodes.get(target);
    const isBroken = broken ?? (targetNode?.placeholder === "missing" && !optional);
    const existing = this.edges.get(id);

    if (existing) {
      if (!existing.evidenceLines.includes(evidence)) {
        existing.evidenceLines.push(evidence);
      }

      const stronger = provenanceStrength[provenance] > provenanceStrength[existing.provenance];

      this.edges.set(id, {
        ...existing,
        provenance: stronger ? provenance : existing.provenance,
        broken: existing.broken || isBroken || undefined,
      });

      return;
    }

    this.edges.set(id, {
      id,
      source,
      target,
      relation,
      provenance,
      evidence,
      evidenceLines: [evidence],
      broken: isBroken || undefined,
    });
  }

  finish(): ArchitectureGraph {
    const edges: GraphEdge[] = [];

    for (const { evidenceLines, ...edge } of this.edges.values()) {
      const finished = { ...edge, evidence: evidenceLines.join("; ") };

      edges.push(finished);

      // A dependency that does not exist is a problem of the object that needs it.
      if (finished.broken) {
        const source = this.nodes.get(finished.source);
        const target = this.nodes.get(finished.target);

        if (source && target) {
          const reason =
            target.placeholder === "missing"
              ? `${target.kind} ${target.name} (${relationText[finished.relation]}) does not exist`
              : `${target.kind} ${target.name} (${relationText[finished.relation]}) rejected the reference: ${finished.evidence}`;

          if (!source.reasons.includes(reason)) {
            source.reasons = [...source.reasons, reason];
          }

          source.health = worse(source.health, "critical");
        }

        if (target?.placeholder === "missing") {
          const referrer = `Referenced by ${source?.kind ?? "?"} ${source?.name ?? finished.source}: ${finished.evidence}`;

          if (!target.reasons.includes(referrer)) {
            target.reasons = [...target.reasons, referrer];
          }
        }
      }
    }

    return { nodes: this.nodes, edges };
  }
}

/** Adds the references of a pod template or pod spec. */
const addPodSpecReferences = (
  builder: GraphBuilder,
  source: string,
  namespace: string | undefined,
  spec: PodSpec,
  { skipClaims }: { skipClaims?: boolean } = {},
) => {
  for (const volume of spec.volumes ?? []) {
    const where = `volume ${volume.name ?? "?"}`;

    if (volume.configMap?.name) {
      const optional = volume.configMap.optional === true;

      builder.edge(
        source,
        builder.target("v1", "ConfigMap", namespace, volume.configMap.name, optional),
        "mounts",
        "referenced",
        where,
        {
          optional,
        },
      );
    }

    if (volume.secret?.secretName) {
      const optional = volume.secret.optional === true;

      builder.edge(
        source,
        builder.target("v1", "Secret", namespace, volume.secret.secretName, optional),
        "mounts",
        "referenced",
        where,
        {
          optional,
        },
      );
    }

    if (volume.persistentVolumeClaim?.claimName && !skipClaims) {
      builder.edge(
        source,
        builder.target("v1", "PersistentVolumeClaim", namespace, volume.persistentVolumeClaim.claimName),
        "mounts",
        "referenced",
        where,
      );
    }

    for (const projected of volume.projected?.sources ?? []) {
      if (projected.configMap?.name) {
        const optional = projected.configMap.optional === true;

        builder.edge(
          source,
          builder.target("v1", "ConfigMap", namespace, projected.configMap.name, optional),
          "mounts",
          "referenced",
          `projected ${where}`,
          {
            optional,
          },
        );
      }

      if (projected.secret?.name) {
        const optional = projected.secret.optional === true;

        builder.edge(
          source,
          builder.target("v1", "Secret", namespace, projected.secret.name, optional),
          "mounts",
          "referenced",
          `projected ${where}`,
          {
            optional,
          },
        );
      }
    }
  }

  const containers = [...(spec.initContainers ?? []), ...(spec.containers ?? []), ...(spec.ephemeralContainers ?? [])];

  for (const container of containers) {
    const name = container.name ?? "?";

    for (const variable of container.env ?? []) {
      const configMapRef = variable.valueFrom?.configMapKeyRef;
      const secretRef = variable.valueFrom?.secretKeyRef;

      if (configMapRef?.name) {
        const optional = configMapRef.optional === true;

        builder.edge(
          source,
          builder.target("v1", "ConfigMap", namespace, configMapRef.name, optional),
          "env",
          "referenced",
          `container ${name}, env ${variable.name ?? "?"} from key ${configMapRef.key ?? "?"}`,
          { optional },
        );
      }

      if (secretRef?.name) {
        const optional = secretRef.optional === true;

        builder.edge(
          source,
          builder.target("v1", "Secret", namespace, secretRef.name, optional),
          "env",
          "referenced",
          `container ${name}, env ${variable.name ?? "?"} from key ${secretRef.key ?? "?"}`,
          { optional },
        );
      }
    }

    for (const from of container.envFrom ?? []) {
      if (from.configMapRef?.name) {
        const optional = from.configMapRef.optional === true;

        builder.edge(
          source,
          builder.target("v1", "ConfigMap", namespace, from.configMapRef.name, optional),
          "env",
          "referenced",
          `container ${name}, envFrom`,
          {
            optional,
          },
        );
      }

      if (from.secretRef?.name) {
        const optional = from.secretRef.optional === true;

        builder.edge(
          source,
          builder.target("v1", "Secret", namespace, from.secretRef.name, optional),
          "env",
          "referenced",
          `container ${name}, envFrom`,
          {
            optional,
          },
        );
      }
    }
  }

  for (const pullSecret of spec.imagePullSecrets ?? []) {
    if (pullSecret.name) {
      builder.edge(
        source,
        builder.target("v1", "Secret", namespace, pullSecret.name),
        "pull-secret",
        "referenced",
        "imagePullSecrets",
      );
    }
  }

  const serviceAccount = spec.serviceAccountName || spec.serviceAccount;

  // Every namespace has a default ServiceAccount; only a named one can be wrong.
  builder.edge(
    source,
    builder.target("v1", "ServiceAccount", namespace, serviceAccount ?? "default", !serviceAccount),
    "service-account",
    serviceAccount ? "referenced" : "inferred",
    serviceAccount ? "serviceAccountName" : "no serviceAccountName: Kubernetes uses default",
    { optional: !serviceAccount },
  );
};

const claimNamesOf = (spec: PodSpec | undefined) =>
  new Set((spec?.volumes ?? []).map((volume) => volume.persistentVolumeClaim?.claimName).filter(Boolean));

const describeNetworkPolicy = (policy: ResourceObject): string[] => {
  const spec = record(policy.spec);
  const types = array<string>(spec.policyTypes);
  const ingress = array<Record<string, unknown>>(spec.ingress);
  const egress = array<Record<string, unknown>>(spec.egress);
  const isolatesIngress = types.length ? types.includes("Ingress") : true;
  const isolatesEgress = types.includes("Egress");
  const peers = (rule: Record<string, unknown>, key: "from" | "to") => {
    const list = array<Record<string, unknown>>(rule[key]);
    const ports = array<Record<string, unknown>>(rule.ports)
      .map((port) => `${str(port.protocol) ?? "TCP"}/${port.port ?? "any"}`)
      .join(", ");
    const who = list.length
      ? list
          .map((peer) => {
            const parts: string[] = [];

            if (peer.podSelector) parts.push(`pods ${describeSelector(peer.podSelector as Selector)}`);
            if (peer.namespaceSelector)
              parts.push(`namespaces ${describeSelector(peer.namespaceSelector as Selector)}`);
            if (peer.ipBlock) parts.push(`CIDR ${str(record(peer.ipBlock).cidr) ?? "?"}`);

            return parts.join(" in ") || "everything";
          })
          .join(" or ")
      : "everywhere";

    return `${who}${ports ? ` on ${ports}` : ""}`;
  };
  const lines: string[] = [];

  if (isolatesIngress) {
    lines.push(
      ingress.length
        ? ingress.map((rule) => `Ingress allowed from ${peers(rule, "from")}`).join("; ")
        : "Ingress: all traffic denied",
    );
  }

  if (isolatesEgress) {
    lines.push(
      egress.length
        ? egress.map((rule) => `Egress allowed to ${peers(rule, "to")}`).join("; ")
        : "Egress: all traffic denied",
    );
  }

  return lines;
};

/** Cilium selects with `k8s:`-prefixed keys and a virtual namespace label. */
const ciliumSelector = (selector: Selector): Selector => {
  const strip = (key: string) => key.replace(/^(k8s|any):/, "");

  return {
    matchLabels: Object.fromEntries(
      Object.entries(selector.matchLabels ?? {}).map(([key, value]) => [strip(key), value]),
    ),
    matchExpressions: (selector.matchExpressions ?? []).map((expression) => ({
      ...expression,
      key: strip(expression.key),
    })),
  };
};

const ciliumPodLabels = (pod: ResourceObject) => ({
  ...pod.metadata.labels,
  "io.kubernetes.pod.namespace": pod.metadata.namespace ?? "",
});

/**
 * Builds the graph of a cluster from what its stores hold. Pure: the same
 * snapshot gives the same graph.
 */
export const buildArchitectureGraph = (snapshot: ClusterSnapshot): ArchitectureGraph => {
  const builder = new GraphBuilder(snapshot);
  const byKind = new Map<string, ResourceObject[]>();

  for (const object of snapshot.objects) {
    builder.addObject(object);

    const list = byKind.get(object.kind);

    if (list) {
      list.push(object);
    } else {
      byKind.set(object.kind, [object]);
    }
  }

  const ofKind = (kind: string) => byKind.get(kind) ?? [];
  const pods = ofKind("Pod");
  const podsByNamespace = new Map<string, ResourceObject[]>();

  for (const pod of pods) {
    const ns = pod.metadata.namespace ?? "";
    const list = podsByNamespace.get(ns);

    if (list) {
      list.push(pod);
    } else {
      podsByNamespace.set(ns, [pod]);
    }
  }

  const podIndexes = new Map<string, LabelIndex<ResourceObject>>();
  const podIndex = (namespace: string) => {
    let index = podIndexes.get(namespace);

    if (!index) {
      index = new LabelIndex(podsByNamespace.get(namespace) ?? [], (pod) => pod.metadata.labels);
      podIndexes.set(namespace, index);
    }

    return index;
  };

  // Ownership, from owner references.
  for (const object of snapshot.objects) {
    const child = idOf(object);

    for (const owner of object.metadata.ownerReferences ?? []) {
      let ownerId = builder.idForUid(owner.uid);

      if (!ownerId) {
        const group = groupOf(owner.apiVersion);
        const loaded = snapshot.coverage.isLoaded(group, owner.kind, object.metadata.namespace);

        ownerId = builder.target(owner.apiVersion, owner.kind, object.metadata.namespace, owner.name);

        const placeholder = builder.node(ownerId);

        if (placeholder && !loaded && placeholder.placeholder === "unverified") {
          // A kind ProLens does not show, typically a custom resource of an operator.
          placeholder.placeholder = "not-loaded";
          placeholder.reasons = [`${owner.kind} is not loaded by ProLens; known from the owner reference`];
        }
      }

      builder.edge(
        ownerId,
        child,
        "owns",
        "observed",
        `ownerReferences of ${object.kind} ${object.metadata.name}${owner.controller ? " (controller)" : ""}`,
        { optional: true },
      );
    }
  }

  // The object that carries the references of a pod template: the topmost
  // controller with a template, so that they are not repeated on every pod.
  const holderOf = (object: ResourceObject): ResourceObject => {
    let current = object;

    for (let depth = 0; depth < 8; depth += 1) {
      const controller =
        current.metadata.ownerReferences?.find((owner) => owner.controller) ?? current.metadata.ownerReferences?.[0];
      const ownerId = controller && builder.idForUid(controller.uid);
      const owner = ownerId && builder.object(ownerId);

      if (!owner || !podSpecOf(owner)) {
        return current;
      }

      current = owner;
    }

    return current;
  };

  for (const kind of [
    "Deployment",
    "StatefulSet",
    "DaemonSet",
    "ReplicaSet",
    "ReplicationController",
    "Job",
    "CronJob",
  ]) {
    for (const workload of ofKind(kind)) {
      if (holderOf(workload) === workload) {
        addPodSpecReferences(builder, idOf(workload), workload.metadata.namespace, podSpecOf(workload) ?? {});
      }
    }
  }

  for (const pod of pods) {
    const id = idOf(pod);
    const spec = podSpecOf(pod) ?? {};
    const holder = holderOf(pod);

    if (holder === pod) {
      addPodSpecReferences(builder, id, pod.metadata.namespace, spec);
    } else {
      // Claims from a StatefulSet's volumeClaimTemplates, or ephemeral
      // volumes, differ per pod and are not in the template's volumes.
      const templateClaims = claimNamesOf(podSpecOf(holder));

      for (const volume of spec.volumes ?? []) {
        const claim = volume.persistentVolumeClaim?.claimName;

        if (claim && !templateClaims.has(claim)) {
          builder.edge(
            id,
            builder.target("v1", "PersistentVolumeClaim", pod.metadata.namespace, claim),
            "mounts",
            "referenced",
            `volume ${volume.name ?? "?"}`,
          );
        }
      }
    }

    for (const volume of spec.volumes ?? []) {
      if (volume.ephemeral && volume.name) {
        builder.edge(
          id,
          builder.target("v1", "PersistentVolumeClaim", pod.metadata.namespace, `${pod.metadata.name}-${volume.name}`),
          "mounts",
          "inferred",
          `ephemeral volume ${volume.name}: Kubernetes names its claim <pod>-<volume>`,
        );
      }
    }

    if (spec.nodeName) {
      builder.edge(id, builder.target("v1", "Node", undefined, spec.nodeName), "runs-on", "observed", "spec.nodeName");
    }
  }

  // Services, their EndpointSlices and the pods behind them.
  const slicesByService = new Map<string, ResourceObject[]>();

  for (const slice of ofKind("EndpointSlice")) {
    const service = slice.metadata.labels?.["kubernetes.io/service-name"];

    if (service) {
      const key = `${slice.metadata.namespace ?? ""}/${service}`;
      const list = slicesByService.get(key);

      if (list) {
        list.push(slice);
      } else {
        slicesByService.set(key, [slice]);
      }
    }
  }

  const slicesLoaded = (namespace?: string) =>
    snapshot.coverage.isLoaded("discovery.k8s.io", "EndpointSlice", namespace);

  for (const service of ofKind("Service")) {
    const id = idOf(service);
    const node = builder.node(id);
    const spec = record(service.spec);
    const namespace = service.metadata.namespace ?? "";
    const selector = { matchLabels: record(spec.selector) as Record<string, string> };
    const endpoints = new Map<string, { ready: boolean; slice: string }>();

    for (const slice of slicesByService.get(`${namespace}/${service.metadata.name}`) ?? []) {
      const sliceId = idOf(slice);

      builder.edge(id, sliceId, "endpoints", "observed", "label kubernetes.io/service-name of the EndpointSlice");

      for (const endpoint of array<Record<string, unknown>>(record(slice).endpoints)) {
        const ref = record(endpoint.targetRef);

        if (ref.kind !== "Pod" || !str(ref.name)) continue;

        const podId = builder.target("v1", "Pod", str(ref.namespace) ?? namespace, ref.name as string);
        const ready = record(endpoint.conditions).ready !== false;
        const address = array<string>(endpoint.addresses).join(", ");

        endpoints.set(podId, { ready: ready || endpoints.get(podId)?.ready === true, slice: slice.metadata.name });
        builder.edge(
          sliceId,
          podId,
          "selects",
          "observed",
          `endpoint ${address || "?"}, ${ready ? "ready" : "not ready"}`,
        );
      }
    }

    if (!node || spec.type === "ExternalName") {
      continue;
    }

    if (isEmptySelector(selector)) {
      node.details = [...node.details, "No selector: endpoints are managed outside Kubernetes' Service controller"];
    }

    const selected = isEmptySelector(selector) ? [] : podIndex(namespace).select(selector);
    const selectorText = describeSelector(selector);

    for (const pod of selected) {
      const podId = idOf(pod);
      const endpoint = endpoints.get(podId);

      if (endpoint) {
        builder.edge(
          id,
          podId,
          "selects",
          "observed",
          `EndpointSlice ${endpoint.slice} lists the pod as ${endpoint.ready ? "ready" : "not ready"}`,
        );
      } else {
        builder.edge(
          id,
          podId,
          "selects",
          "inferred",
          slicesLoaded(namespace)
            ? `selector ${selectorText} matches the pod's labels, but no EndpointSlice lists it`
            : `selector ${selectorText} matches the pod's labels`,
        );
      }
    }

    for (const [podId, endpoint] of endpoints) {
      builder.edge(
        id,
        podId,
        "selects",
        "observed",
        `EndpointSlice ${endpoint.slice} lists the pod as ${endpoint.ready ? "ready" : "not ready"}`,
      );
    }

    if (isEmptySelector(selector)) continue;

    const podsKnown = snapshot.coverage.isLoaded("", "Pod", namespace);
    const ready = slicesLoaded(namespace)
      ? [...endpoints.values()].filter((endpoint) => endpoint.ready).length
      : selected.filter((pod) =>
          array<{ type?: string; status?: string }>(record(pod.status).conditions).some(
            (c) => c.type === "Ready" && c.status === "True",
          ),
        ).length;
    const total = Math.max(selected.length, endpoints.size);

    node.status = `${node.status ?? ""}, ${ready}/${total} endpoints ready`;

    if (podsKnown && total === 0) {
      node.health = worse(node.health, "critical");
      node.reasons = [...node.reasons, `Selector ${selectorText} matches no pods in namespace ${namespace}`];
    } else if (podsKnown && ready === 0) {
      node.health = worse(node.health, "critical");
      node.reasons = [
        ...node.reasons,
        `No ready endpoints: ${total} pod${total === 1 ? "" : "s"} selected, none ready`,
      ];
    }
  }

  // Ingresses.
  const defaultIngressClass = ofKind("IngressClass").find(
    (ingressClass) => ingressClass.metadata.annotations?.["ingressclass.kubernetes.io/is-default-class"] === "true",
  );

  for (const ingress of ofKind("Ingress")) {
    const id = idOf(ingress);
    const spec = record(ingress.spec);
    const namespace = ingress.metadata.namespace;
    const className = str(spec.ingressClassName) ?? str(ingress.metadata.annotations?.["kubernetes.io/ingress.class"]);

    if (className) {
      builder.edge(
        id,
        builder.target("networking.k8s.io/v1", "IngressClass", undefined, className),
        "class",
        "referenced",
        spec.ingressClassName ? "spec.ingressClassName" : "annotation kubernetes.io/ingress.class",
      );
    } else if (defaultIngressClass) {
      builder.edge(
        id,
        idOf(defaultIngressClass),
        "class",
        "inferred",
        "no class set: the default IngressClass applies",
      );
    }

    const backend = (value: unknown, where: string) => {
      const backendRecord = record(value);
      const service = record(backendRecord.service);
      const name = str(service.name) ?? str(backendRecord.serviceName);
      const port = record(service.port);
      const portText = str(port.name) ?? (port.number as number | undefined) ?? backendRecord.servicePort ?? "?";

      if (name) {
        builder.edge(
          id,
          builder.target("v1", "Service", namespace, name),
          "routes-to",
          "referenced",
          `${where} → ${name}:${portText}`,
        );
      }
    };

    backend(spec.defaultBackend ?? spec.backend, "default backend");

    for (const rule of array<Record<string, unknown>>(spec.rules)) {
      for (const path of array<Record<string, unknown>>(record(rule.http).paths)) {
        backend(path.backend, `${str(rule.host) ?? "*"}${str(path.path) ?? "/"}`);
      }
    }
  }

  // Gateway API.
  for (const gateway of ofKind("Gateway").filter((object) => groupOf(object.apiVersion) === gatewayApiGroup)) {
    const className = str(record(gateway.spec).gatewayClassName);

    if (className) {
      builder.edge(
        idOf(gateway),
        builder.target(`${gatewayApiGroup}/v1`, "GatewayClass", undefined, className),
        "class",
        "referenced",
        "spec.gatewayClassName",
      );
    }
  }

  for (const kind of routeKinds) {
    for (const route of ofKind(kind).filter((object) => groupOf(object.apiVersion) === gatewayApiGroup)) {
      const id = idOf(route);
      const spec = record(route.spec);
      const status = record(route.status);
      const namespace = route.metadata.namespace;

      for (const parent of array<Record<string, unknown>>(spec.parentRefs)) {
        const parentKind = str(parent.kind) ?? "Gateway";
        const parentGroup = str(parent.group) ?? gatewayApiGroup;
        const parentNamespace = str(parent.namespace) ?? namespace;
        const parentName = str(parent.name);

        if (!parentName) continue;

        const parentStatus = array<Record<string, unknown>>(status.parents).find((entry) => {
          const ref = record(entry.parentRef);

          return str(ref.name) === parentName && (str(ref.namespace) ?? namespace) === parentNamespace;
        });
        const accepted = array<{ type?: string; status?: string; reason?: string; message?: string }>(
          parentStatus?.conditions,
        ).find((condition) => condition.type === "Accepted");
        const gatewayId = builder.target(
          parentGroup ? `${parentGroup}/v1` : "v1",
          parentKind,
          parentNamespace,
          parentName,
        );
        const section = str(parent.sectionName) ? `, listener ${parent.sectionName}` : "";

        if (accepted?.status === "True") {
          builder.edge(gatewayId, id, "attaches", "observed", `accepted by the gateway (status.parents)${section}`);
        } else if (accepted?.status === "False") {
          builder.edge(
            gatewayId,
            id,
            "attaches",
            "referenced",
            `rejected: ${accepted.reason ?? ""} ${accepted.message ?? ""}`.trim(),
            { broken: true },
          );
        } else {
          builder.edge(gatewayId, id, "attaches", "referenced", `spec.parentRefs${section}; not yet accepted`);
        }
      }

      for (const rule of array<Record<string, unknown>>(spec.rules)) {
        for (const backendRef of array<Record<string, unknown>>(rule.backendRefs)) {
          const backendKind = str(backendRef.kind) ?? "Service";
          const backendGroup = str(backendRef.group) ?? "";
          const backendName = str(backendRef.name);
          const backendNamespace = str(backendRef.namespace) ?? namespace;

          if (!backendName) continue;

          const crossNamespace = backendNamespace !== namespace ? " (cross-namespace: needs a ReferenceGrant)" : "";

          builder.edge(
            id,
            builder.target(backendGroup ? `${backendGroup}/v1` : "v1", backendKind, backendNamespace, backendName),
            "routes-to",
            "referenced",
            `backendRefs → ${backendName}:${backendRef.port ?? "?"}${crossNamespace}`,
          );
        }
      }
    }
  }

  // Network policies.
  for (const policy of ofKind("NetworkPolicy")) {
    const id = idOf(policy);
    const node = builder.node(id);
    const selector = record(policy.spec).podSelector as Selector | undefined;
    const lines = describeNetworkPolicy(policy);

    if (node) node.details = lines;

    const matched = podIndex(policy.metadata.namespace ?? "").select(selector ?? {});

    for (const pod of matched) {
      builder.edge(id, idOf(pod), "applies-to", "inferred", `podSelector ${describeSelector(selector ?? {})}`);

      const podNode = builder.node(idOf(pod));

      if (podNode) {
        podNode.details = [
          ...podNode.details,
          ...lines.map((line) => `NetworkPolicy ${policy.metadata.name}: ${line}`),
        ];
      }
    }
  }

  for (const kind of ["CiliumNetworkPolicy", "CiliumClusterwideNetworkPolicy"]) {
    for (const policy of ofKind(kind).filter((object) => groupOf(object.apiVersion) === ciliumGroup)) {
      const id = idOf(policy);
      const spec = record(policy.spec);
      const specs = [spec, ...array<Record<string, unknown>>(record(policy).specs)];
      const candidates =
        kind === "CiliumNetworkPolicy" ? (podsByNamespace.get(policy.metadata.namespace ?? "") ?? []) : pods;

      for (const entry of specs) {
        const endpointSelector = entry.endpointSelector as Selector | undefined;

        if (!endpointSelector) continue;

        const selector = ciliumSelector(endpointSelector);

        for (const pod of candidates) {
          if (matchesSelector(selector, ciliumPodLabels(pod))) {
            builder.edge(
              id,
              idOf(pod),
              "applies-to",
              "inferred",
              `endpointSelector ${describeSelector(endpointSelector)}`,
            );
          }
        }
      }
    }
  }

  // Storage.
  const defaultStorageClass = ofKind("StorageClass").find(
    (storageClass) =>
      storageClass.metadata.annotations?.["storageclass.kubernetes.io/is-default-class"] === "true" ||
      storageClass.metadata.annotations?.["storageclass.beta.kubernetes.io/is-default-class"] === "true",
  );

  for (const claim of ofKind("PersistentVolumeClaim")) {
    const id = idOf(claim);
    const spec = record(claim.spec);
    const phase = str(record(claim.status).phase);
    const volumeName = str(spec.volumeName);

    if (volumeName) {
      builder.edge(
        id,
        builder.target("v1", "PersistentVolume", undefined, volumeName),
        "binds",
        phase === "Bound" ? "observed" : "referenced",
        phase === "Bound" ? "spec.volumeName, claim is Bound" : `spec.volumeName, claim is ${phase ?? "not bound"}`,
      );
    }

    if (typeof spec.storageClassName === "string") {
      if (spec.storageClassName) {
        builder.edge(
          id,
          builder.target("storage.k8s.io/v1", "StorageClass", undefined, spec.storageClassName),
          "class",
          "referenced",
          "spec.storageClassName",
        );
      }
    } else if (defaultStorageClass) {
      builder.edge(
        id,
        idOf(defaultStorageClass),
        "class",
        "inferred",
        "no storageClassName: the default StorageClass applies",
      );
    }
  }

  for (const volume of ofKind("PersistentVolume")) {
    const id = idOf(volume);
    const spec = record(volume.spec);
    const claimRef = record(spec.claimRef);
    const className = str(spec.storageClassName);

    if (className) {
      builder.edge(
        id,
        builder.target("storage.k8s.io/v1", "StorageClass", undefined, className),
        "class",
        "referenced",
        "spec.storageClassName",
      );
    }

    if (str(claimRef.name) && str(record(volume.status).phase) === "Bound") {
      builder.edge(
        builder.target("v1", "PersistentVolumeClaim", str(claimRef.namespace), claimRef.name as string),
        id,
        "binds",
        "observed",
        "spec.claimRef of the volume, volume is Bound",
      );
    }
  }

  // Warning events, by the object they are about.
  const eventsByObject = new Map<string, ResourceEvent[]>();

  for (const event of snapshot.events) {
    if (event.type !== "Warning") continue;

    const key =
      event.involvedObject.uid ??
      eventKey(event.involvedObject.kind, event.involvedObject.namespace, event.involvedObject.name);
    const list = eventsByObject.get(key);

    if (list) {
      list.push(event);
    } else {
      eventsByObject.set(key, [event]);
    }
  }

  if (eventsByObject.size) {
    for (const node of builder.nodes.values()) {
      const events = [
        ...((node.uid && eventsByObject.get(node.uid)) || []),
        ...(eventsByObject.get(eventKey(node.kind, node.namespace, node.name)) ?? []),
      ];

      if (events.length) {
        node.warningEvents = summarizeEvents(events);
      }
    }
  }

  return builder.finish();
};
