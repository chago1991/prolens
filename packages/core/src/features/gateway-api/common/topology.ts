/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { gatewayApiGroup, getGatewayApiKindOf, routeProtocols } from "./kinds";
import {
  backendRefsOf,
  gatewayClassInfo,
  gatewayInfo,
  groupOf,
  healthOfConditions,
  hostnamesOf,
  isReferenceGranted,
  list,
  listenerSetInfo,
  parentRefsOf,
  record,
  routeHostnamesIntersect,
  routeStateFor,
  routeStateHealth,
  str,
} from "./model";

import type { GatewayApiObject, Health, Listener, ParentRef } from "./model";

export type TopologyKind =
  | "GatewayClass"
  | "Gateway"
  | "Listener"
  | "Route"
  | "Service"
  | "EndpointSlice"
  | "Pod"
  | "Backend";

export const topologyTiers: Record<TopologyKind, number> = {
  GatewayClass: 0,
  Gateway: 1,
  Listener: 2,
  Route: 3,
  Service: 4,
  Backend: 4,
  EndpointSlice: 5,
  Pod: 6,
};

export interface TopologyNode {
  readonly id: string;
  readonly kind: TopologyKind;
  /** The Kubernetes kind, such as `HTTPRoute` for a route node. */
  readonly objectKind: string;
  readonly name: string;
  readonly namespace?: string;
  readonly subtitle?: string;
  readonly health: Health;
  /** Why the node is unhealthy, for the inspector. */
  readonly problems: readonly string[];
  /** The self link to open the details of, absent for listeners and missing objects. */
  readonly selfLink?: string;
  readonly missing: boolean;
}

export interface TopologyEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly broken: boolean;
  readonly reason?: string;
}

export interface TopologyGraph {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
  /** Nodes left out to stay under the limit. */
  readonly truncated: number;
  readonly problems: number;
}

export interface TopologyInput {
  readonly gatewayClasses: readonly GatewayApiObject[];
  readonly gateways: readonly GatewayApiObject[];
  readonly listenerSets?: readonly GatewayApiObject[];
  readonly routes: readonly GatewayApiObject[];
  readonly referenceGrants: readonly GatewayApiObject[];
  readonly services: readonly GatewayApiObject[];
  readonly endpointSlices: readonly GatewayApiObject[];
  readonly pods: readonly GatewayApiObject[];
}

export interface TopologyOptions {
  /** Only what is reachable from routes and gateways of these namespaces; all when empty. */
  readonly namespaces?: readonly string[];
  /** Only the subgraph around this Gateway (`namespace/name`). */
  readonly gateway?: string;
  readonly showPods?: boolean;
  readonly maxNodes?: number;
}

const key = (kind: string, namespace: string | undefined, name: string) =>
  `${kind}:${namespace ? `${namespace}/` : ""}${name}`;

const listenerKey = (gatewayNamespace: string, gateway: string, listener: string) =>
  `Listener:${gatewayNamespace}/${gateway}#${listener}`;

const podHealth = (pod: GatewayApiObject): Health => {
  const status = record(pod.status);
  const phase = str(status.phase);
  const ready = list(status.conditions).find((condition) => condition.type === "Ready");

  if (phase === "Succeeded") return "unknown";
  if (phase === "Failed") return "critical";
  if (phase === "Running" && ready?.status === "True") return "healthy";

  return "warning";
};

/** Listeners a parent reference selects on a Gateway, by section name, port and protocol. */
export const listenersForParent = (
  listeners: readonly Listener[],
  parent: ParentRef,
  routeKind: string,
  routeHostnames: readonly string[],
) => {
  const protocols = routeProtocols[routeKind] ?? [];

  return listeners.filter(
    (listener) =>
      (!parent.sectionName || listener.name === parent.sectionName) &&
      (parent.port === undefined || listener.port === parent.port) &&
      (protocols.length === 0 || protocols.includes(listener.protocol)) &&
      (!listener.allowedRoutes?.kinds?.length ||
        listener.allowedRoutes.kinds.some((kind) => kind.kind === routeKind)) &&
      (routeKind === "TCPRoute" ||
        routeKind === "UDPRoute" ||
        routeHostnamesIntersect(listener.hostname, routeHostnames)),
  );
};

/**
 * The topology GatewayClass → Gateway → Listener → Route → Service →
 * EndpointSlice → Pod. Only services that routes reference are included,
 * and only the slices and pods of those, so the graph stays proportional to
 * the Gateway API resources rather than to the cluster.
 */
export const buildTopology = (input: TopologyInput, options: TopologyOptions = {}): TopologyGraph => {
  const maxNodes = options.maxNodes ?? 800;
  const namespaces = new Set(options.namespaces ?? []);
  const inScope = (namespace: string | undefined) => namespaces.size === 0 || !namespace || namespaces.has(namespace);

  const nodes = new Map<string, TopologyNode>();
  const edges = new Map<string, TopologyEdge>();

  const addNode = (node: TopologyNode) => {
    const existing = nodes.get(node.id);

    if (!existing || (existing.missing && !node.missing)) nodes.set(node.id, node);

    return node.id;
  };

  const addEdge = (edge: Omit<TopologyEdge, "id">) => {
    const id = `${edge.source}->${edge.target}${edge.label ? `#${edge.label}` : ""}`;

    if (!edges.has(id)) edges.set(id, { ...edge, id });
  };

  const missingNode = (
    kind: TopologyKind,
    objectKind: string,
    namespace: string | undefined,
    name: string,
    problem: string,
  ) =>
    addNode({
      id: key(objectKind, namespace, name),
      kind,
      objectKind,
      name,
      namespace,
      health: "missing",
      problems: [problem],
      missing: true,
    });

  const classes = new Map(input.gatewayClasses.map((gatewayClass) => [gatewayClass.metadata.name, gatewayClass]));
  const gatewaysByKey = new Map(
    input.gateways.map((gateway) => [key("Gateway", gateway.metadata.namespace, gateway.metadata.name), gateway]),
  );
  const services = new Map(
    input.services.map((service) => [key("Service", service.metadata.namespace, service.metadata.name), service]),
  );

  const selectedGateways = input.gateways.filter((gateway) =>
    options.gateway
      ? `${gateway.metadata.namespace}/${gateway.metadata.name}` === options.gateway
      : inScope(gateway.metadata.namespace),
  );

  // Listeners merged from ListenerSets, by the Gateway they attach to.
  const mergedListeners = new Map<string, Listener[]>();

  for (const listenerSet of input.listenerSets ?? []) {
    const info = listenerSetInfo(listenerSet);
    const gatewayKey = key("Gateway", info.parentRef.namespace, info.parentRef.name);
    const merged = mergedListeners.get(gatewayKey) ?? [];

    merged.push(...info.listeners);
    mergedListeners.set(gatewayKey, merged);
  }

  const listenersOf = (gateway: GatewayApiObject) => [
    ...gatewayInfo(gateway).listeners,
    ...(mergedListeners.get(key("Gateway", gateway.metadata.namespace, gateway.metadata.name)) ?? []),
  ];

  const addGateway = (gateway: GatewayApiObject) => {
    const info = gatewayInfo(gateway);
    const namespace = gateway.metadata.namespace ?? "default";
    const health = healthOfConditions(info.conditions, gateway.metadata.generation);
    const gatewayId = addNode({
      id: key("Gateway", namespace, gateway.metadata.name),
      kind: "Gateway",
      objectKind: "Gateway",
      name: gateway.metadata.name,
      namespace,
      subtitle: info.addresses.join(", ") || info.className,
      health,
      problems: info.conditions
        .filter((condition) => condition.status === "False")
        .map((condition) => `${condition.type}: ${condition.reason ?? condition.message ?? "False"}`),
      selfLink: gateway.metadata.selfLink,
      missing: false,
    });

    if (info.className) {
      const gatewayClass = classes.get(info.className);
      const classId = gatewayClass
        ? addNode({
            id: key("GatewayClass", undefined, info.className),
            kind: "GatewayClass",
            objectKind: "GatewayClass",
            name: info.className,
            subtitle: gatewayClassInfo(gatewayClass).controllerName,
            health: healthOfConditions(gatewayClassInfo(gatewayClass).conditions, gatewayClass.metadata.generation),
            problems: gatewayClassInfo(gatewayClass)
              .conditions.filter((condition) => condition.status === "False")
              .map((condition) => `${condition.type}: ${condition.reason ?? "False"}`),
            selfLink: gatewayClass.metadata.selfLink,
            missing: false,
          })
        : missingNode("GatewayClass", "GatewayClass", undefined, info.className, "The GatewayClass does not exist.");

      addEdge({
        source: classId,
        target: gatewayId,
        broken: !gatewayClass,
        reason: gatewayClass ? undefined : "missing class",
      });
    }

    const statuses = new Map(info.listenerStatuses.map((status) => [status.name, status]));

    for (const listener of listenersOf(gateway)) {
      const status = statuses.get(listener.name);
      const listenerHealth = status ? healthOfConditions(status.conditions) : "unknown";

      const listenerId = addNode({
        id: listenerKey(namespace, gateway.metadata.name, listener.name),
        kind: "Listener",
        objectKind: "Listener",
        name: listener.name,
        namespace,
        subtitle: `${listener.protocol}:${listener.port}${listener.hostname ? ` ${listener.hostname}` : ""}${status ? ` · ${status.attachedRoutes} routes` : ""}`,
        health: listenerHealth,
        problems: (status?.conditions ?? [])
          .filter((condition) => condition.status === (condition.type === "Conflicted" ? "True" : "False"))
          .map((condition) => `${condition.type}: ${condition.reason ?? condition.status}`),
        selfLink: gateway.metadata.selfLink,
        missing: false,
      });

      addEdge({ source: gatewayId, target: listenerId, broken: false });
    }

    return gatewayId;
  };

  for (const gateway of selectedGateways) addGateway(gateway);

  const servicesToExpand = new Set<string>();

  for (const route of input.routes) {
    const routeNamespace = route.metadata.namespace ?? "default";
    const routeKind = route.kind ?? "Route";
    const parents = parentRefsOf(route);
    const gatewayParents = parents.filter((parent) => parent.kind === "Gateway" && parent.group === gatewayApiGroup);

    const attachesToSelected = options.gateway
      ? gatewayParents.some((parent) => `${parent.namespace}/${parent.name}` === options.gateway)
      : inScope(routeNamespace) || gatewayParents.some((parent) => inScope(parent.namespace));

    if (!attachesToSelected) continue;

    const state = routeStateFor(route);
    const definition = getGatewayApiKindOf(route.apiVersion, route.kind);
    const routeId = addNode({
      id: key(routeKind, routeNamespace, route.metadata.name),
      kind: "Route",
      objectKind: routeKind,
      name: route.metadata.name,
      namespace: routeNamespace,
      subtitle: `${definition?.kind ?? routeKind}${hostnamesOf(route).length ? ` · ${hostnamesOf(route).join(", ")}` : ""}`,
      health: routeStateHealth[state],
      problems:
        state === "rejected"
          ? ["Rejected by a parent"]
          : state === "unresolved"
            ? ["References do not resolve"]
            : state === "pending"
              ? ["No controller has accepted the route yet"]
              : [],
      selfLink: route.metadata.selfLink,
      missing: false,
    });

    for (const parent of gatewayParents) {
      if (options.gateway && `${parent.namespace}/${parent.name}` !== options.gateway) continue;

      const gatewayKey = key("Gateway", parent.namespace, parent.name);
      const gateway = gatewaysByKey.get(gatewayKey);
      const parentState = routeStateFor(route, parent);
      const rejected = parentState === "rejected";

      if (!gateway) {
        const missing = missingNode(
          "Gateway",
          "Gateway",
          parent.namespace,
          parent.name,
          "The parent Gateway does not exist.",
        );

        addEdge({ source: missing, target: routeId, broken: true, reason: "parent Gateway missing" });
        continue;
      }

      if (!nodes.has(gatewayKey)) addGateway(gateway);

      const matching = listenersForParent(listenersOf(gateway), parent, routeKind, hostnamesOf(route));

      if (matching.length === 0) {
        addEdge({
          source: gatewayKey,
          target: routeId,
          broken: true,
          reason: parent.sectionName ? `no listener "${parent.sectionName}" accepts it` : "no listener accepts it",
        });
        continue;
      }

      for (const listener of matching) {
        addEdge({
          source: listenerKey(parent.namespace, parent.name, listener.name),
          target: routeId,
          broken: rejected,
          reason: rejected ? "rejected" : undefined,
        });
      }
    }

    // Backends.
    const refs = backendRefsOf(route);
    const rules = new Set(refs.map((ref) => ref.ruleIndex));
    const weighted = [...rules].some((rule) => refs.filter((ref) => ref.ruleIndex === rule).length > 1);

    for (const ref of refs) {
      const isService = ref.kind === "Service" && ref.group === "";
      const granted = isReferenceGranted(input.referenceGrants, {
        fromGroup: groupOf(route.apiVersion),
        fromKind: routeKind,
        fromNamespace: routeNamespace,
        toGroup: ref.group,
        toKind: ref.kind,
        toName: ref.name,
        toNamespace: ref.namespace,
      });
      const label = weighted
        ? `${ref.share}%${ref.port ? ` :${ref.port}` : ""}`
        : ref.port
          ? `:${ref.port}`
          : undefined;

      if (!isService) {
        const backendId = addNode({
          id: key(ref.kind, ref.namespace, ref.name),
          kind: "Backend",
          objectKind: ref.kind,
          name: ref.name,
          namespace: ref.namespace,
          subtitle: ref.group ? `${ref.kind}.${ref.group}` : ref.kind,
          health: "unknown",
          problems: [],
          missing: false,
        });

        addEdge({
          source: routeId,
          target: backendId,
          label,
          broken: !granted,
          reason: granted ? undefined : "no ReferenceGrant",
        });
        continue;
      }

      const serviceKey = key("Service", ref.namespace, ref.name);
      const service = services.get(serviceKey);

      if (!service) {
        missingNode("Service", "Service", ref.namespace, ref.name, "The backend Service does not exist.");
        addEdge({ source: routeId, target: serviceKey, label, broken: true, reason: "missing backend" });
        continue;
      }

      const ports = list(record(service.spec).ports);
      const portExists = ref.port === undefined || ports.some((port) => port.port === ref.port);

      addNode({
        id: serviceKey,
        kind: "Service",
        objectKind: "Service",
        name: ref.name,
        namespace: ref.namespace,
        subtitle: str(record(service.spec).type) ?? "ClusterIP",
        health: "healthy",
        problems: portExists ? [] : [`Port ${ref.port} is not a port of the Service.`],
        selfLink: service.metadata.selfLink,
        missing: false,
      });
      addEdge({
        source: routeId,
        target: serviceKey,
        label,
        broken: !granted || !portExists,
        reason: !granted
          ? "cross-namespace reference without a ReferenceGrant"
          : !portExists
            ? "unknown port"
            : undefined,
      });
      servicesToExpand.add(serviceKey);
    }
  }

  // EndpointSlices and pods of the referenced services.
  const slicesByService = new Map<string, GatewayApiObject[]>();

  for (const slice of input.endpointSlices) {
    const serviceName = slice.metadata.labels?.["kubernetes.io/service-name"];

    if (!serviceName) continue;

    const serviceKey = key("Service", slice.metadata.namespace, serviceName);

    if (!servicesToExpand.has(serviceKey)) continue;

    const slices = slicesByService.get(serviceKey) ?? [];

    slices.push(slice);
    slicesByService.set(serviceKey, slices);
  }

  const pods = new Map(input.pods.map((pod) => [key("Pod", pod.metadata.namespace, pod.metadata.name), pod]));

  for (const serviceKey of servicesToExpand) {
    const slices = slicesByService.get(serviceKey) ?? [];
    const service = nodes.get(serviceKey);
    const readyEndpoints = slices.flatMap((slice) =>
      list((slice as unknown as Record<string, unknown>).endpoints).filter(
        (endpoint) => record(endpoint.conditions).ready !== false,
      ),
    );

    if (service && readyEndpoints.length === 0) {
      nodes.set(serviceKey, {
        ...service,
        health: service.health === "healthy" ? "warning" : service.health,
        problems: [...service.problems, "The Service has no ready endpoints."],
      });
    }

    for (const slice of slices) {
      const endpoints = list((slice as unknown as Record<string, unknown>).endpoints);
      const ready = endpoints.filter((endpoint) => record(endpoint.conditions).ready !== false).length;
      const sliceId = addNode({
        id: key("EndpointSlice", slice.metadata.namespace, slice.metadata.name),
        kind: "EndpointSlice",
        objectKind: "EndpointSlice",
        name: slice.metadata.name,
        namespace: slice.metadata.namespace,
        subtitle: `${ready}/${endpoints.length} ready`,
        health:
          endpoints.length === 0
            ? "warning"
            : ready === endpoints.length
              ? "healthy"
              : ready > 0
                ? "warning"
                : "critical",
        problems: ready < endpoints.length ? [`${endpoints.length - ready} endpoints are not ready.`] : [],
        selfLink: slice.metadata.selfLink,
        missing: false,
      });

      addEdge({ source: serviceKey, target: sliceId, broken: false });

      if (options.showPods === false) continue;

      for (const endpoint of endpoints) {
        const target = record(endpoint.targetRef);

        if (target.kind !== "Pod" || !str(target.name)) continue;

        const podKey = key("Pod", str(target.namespace) ?? slice.metadata.namespace, target.name as string);
        const pod = pods.get(podKey);

        if (!pod) continue;

        const podId = addNode({
          id: podKey,
          kind: "Pod",
          objectKind: "Pod",
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          subtitle: str(record(pod.status).phase),
          health: podHealth(pod),
          problems: podHealth(pod) === "healthy" ? [] : ["The Pod is not ready."],
          selfLink: pod.metadata.selfLink,
          missing: false,
        });

        addEdge({ source: sliceId, target: podId, broken: false });
      }
    }
  }

  let allNodes = [...nodes.values()];
  let truncated = 0;

  if (allNodes.length > maxNodes) {
    // Keep the upper tiers whole and cut from the bottom (pods first).
    allNodes = allNodes.sort((a, b) => topologyTiers[a.kind] - topologyTiers[b.kind]);
    truncated = allNodes.length - maxNodes;
    allNodes = allNodes.slice(0, maxNodes);
  }

  const kept = new Set(allNodes.map((node) => node.id));
  const allEdges = [...edges.values()].filter((edge) => kept.has(edge.source) && kept.has(edge.target));

  return {
    nodes: allNodes,
    edges: allEdges,
    truncated,
    problems:
      allNodes.filter((node) => node.health === "critical" || node.health === "missing").length +
      allEdges.filter((edge) => edge.broken).length,
  };
};

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const topologyNodeSize = { width: 220, height: 64 };

/**
 * Columns by tier, left to right, ordered within a column by the mean row
 * of the nodes they connect to (two sweeps), which keeps most edges short.
 */
export const layoutTopology = (graph: TopologyGraph, spacing = { column: 90, row: 18 }) => {
  const columns = new Map<number, TopologyNode[]>();

  for (const node of graph.nodes) {
    const tier = topologyTiers[node.kind];
    const column = columns.get(tier) ?? [];

    column.push(node);
    columns.set(tier, column);
  }

  const tiers = [...columns.keys()].sort((a, b) => a - b);
  const order = new Map<string, number>();
  const neighbours = new Map<string, string[]>();

  for (const edge of graph.edges) {
    neighbours.set(edge.source, [...(neighbours.get(edge.source) ?? []), edge.target]);
    neighbours.set(edge.target, [...(neighbours.get(edge.target) ?? []), edge.source]);
  }

  for (const tier of tiers) {
    const column = columns.get(tier) as TopologyNode[];

    column.sort((a, b) => `${a.namespace ?? ""}/${a.name}`.localeCompare(`${b.namespace ?? ""}/${b.name}`));
    column.forEach((node, index) => order.set(node.id, index));
  }

  for (const sequence of [tiers, [...tiers].reverse()]) {
    for (const tier of sequence) {
      const column = columns.get(tier) as TopologyNode[];
      const weight = (node: TopologyNode) => {
        const placed = (neighbours.get(node.id) ?? [])
          .map((id) => order.get(id))
          .filter((value) => value !== undefined) as number[];

        return placed.length
          ? placed.reduce((sum, value) => sum + value, 0) / placed.length
          : (order.get(node.id) ?? 0);
      };
      const weights = new Map(column.map((node) => [node.id, weight(node)]));

      column.sort((a, b) => (weights.get(a.id) ?? 0) - (weights.get(b.id) ?? 0) || a.name.localeCompare(b.name));
      column.forEach((node, index) => order.set(node.id, index));
    }
  }

  const positions = new Map<string, Point>();
  const tallest = Math.max(1, ...[...columns.values()].map((column) => column.length));
  const height = tallest * (topologyNodeSize.height + spacing.row);

  tiers.forEach((tier, columnIndex) => {
    const column = columns.get(tier) as TopologyNode[];
    const offset = (height - column.length * (topologyNodeSize.height + spacing.row)) / 2;

    column.forEach((node, row) => {
      positions.set(node.id, {
        x: columnIndex * (topologyNodeSize.width + spacing.column),
        y: offset + row * (topologyNodeSize.height + spacing.row),
      });
    });
  });

  return positions;
};
