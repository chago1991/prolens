/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { healthRank, isProblem, worse } from "./health";

import type { Analysis } from "./analyze";
import type { ArchitectureGraph, GraphEdge, GraphNode, Health, Provenance, Relation } from "./types";

export type ExplorerMode = "cluster" | "namespace" | "application" | "scheduling" | "network" | "storage" | "routing";

export type GroupBy = "namespace" | "node" | "none";

export const explorerModes: readonly { id: ExplorerMode; title: string; description: string }[] = [
  {
    id: "application",
    title: "Dependencies",
    description: "What a resource needs, what needs it, and where problems start",
  },
  { id: "cluster", title: "Cluster", description: "Every resource of the loaded namespaces" },
  { id: "namespace", title: "Namespace", description: "The resources of one namespace" },
  {
    id: "network",
    title: "Network",
    description: "Ingresses, gateways, Services, endpoints, pods and network policies",
  },
  { id: "routing", title: "Routing", description: "Gateway API and Ingress routing to Services" },
  { id: "storage", title: "Storage", description: "Pods, claims, volumes and storage classes" },
  { id: "scheduling", title: "Scheduling", description: "Pods on nodes, with their workloads" },
];

/** Workloads without the ReplicaSets between Deployments and pods, which are bridged. */
const workloadKinds = ["CronJob", "Deployment", "StatefulSet", "DaemonSet", "ReplicationController", "Job"];
const routeKinds = ["HTTPRoute", "GRPCRoute", "TLSRoute", "TCPRoute", "UDPRoute"];
const policyKinds = ["NetworkPolicy", "CiliumNetworkPolicy", "CiliumClusterwideNetworkPolicy"];

/** The kinds a mode shows; `undefined` shows every kind. */
const modeKinds: Record<ExplorerMode, ReadonlySet<string> | undefined> = {
  cluster: undefined,
  namespace: undefined,
  application: undefined,
  scheduling: new Set(["Node", "Pod", ...workloadKinds]),
  network: new Set([
    "IngressClass",
    "Ingress",
    "GatewayClass",
    "Gateway",
    ...routeKinds,
    "Service",
    "EndpointSlice",
    "Pod",
    ...policyKinds,
  ]),
  storage: new Set(["Pod", "PersistentVolumeClaim", "PersistentVolume", "StorageClass", ...workloadKinds]),
  routing: new Set(["IngressClass", "Ingress", "GatewayClass", "Gateway", ...routeKinds, "Service", "Pod"]),
};

/** Kinds hidden at first where every kind is shown, because they add noise. */
const quietKinds: Record<ExplorerMode, readonly string[]> = {
  cluster: ["EndpointSlice", "ServiceAccount"],
  namespace: ["EndpointSlice"],
  application: [],
  scheduling: [],
  network: [],
  storage: [],
  routing: [],
};

export const defaultHiddenKinds = (mode: ExplorerMode): Set<string> => new Set(quietKinds[mode]);

/** The kinds a mode can show, for its filter; `undefined` for every kind. */
export const kindsOfMode = (mode: ExplorerMode): ReadonlySet<string> | undefined => modeKinds[mode];

export const defaultGroupBy: Record<ExplorerMode, GroupBy> = {
  cluster: "namespace",
  namespace: "none",
  application: "none",
  scheduling: "node",
  network: "namespace",
  storage: "namespace",
  routing: "namespace",
};

/** The column of a kind, in the direction traffic and dependencies flow. */
const kindTier: Record<string, number> = {
  GatewayClass: 0,
  IngressClass: 0,
  Gateway: 1,
  Ingress: 2,
  HTTPRoute: 2,
  GRPCRoute: 2,
  TLSRoute: 2,
  TCPRoute: 2,
  UDPRoute: 2,
  Service: 3,
  EndpointSlice: 4,
  NetworkPolicy: 4,
  CiliumNetworkPolicy: 4,
  CiliumClusterwideNetworkPolicy: 4,
  CronJob: 5,
  Deployment: 5,
  StatefulSet: 5,
  DaemonSet: 5,
  ReplicationController: 5,
  Job: 6,
  ReplicaSet: 6,
  Pod: 7,
  ConfigMap: 8,
  Secret: 8,
  ServiceAccount: 8,
  PersistentVolumeClaim: 8,
  PersistentVolume: 9,
  Node: 9,
  StorageClass: 10,
};

export const tierOf = (kind: string): number => kindTier[kind] ?? 5;

export interface ViewOptions {
  readonly mode: ExplorerMode;
  readonly namespace?: string;
  readonly analysis?: Analysis;
  readonly hiddenKinds: ReadonlySet<string>;
  readonly problemsOnly: boolean;
  readonly hideInactiveReplicaSets: boolean;
  readonly aggregatePods: boolean;
  /** Aggregates the user expanded, by aggregate id. */
  readonly expanded: ReadonlySet<string>;
  readonly collapsedGroups: ReadonlySet<string>;
  readonly groupBy: GroupBy;
  readonly maxNodes: number;
  readonly search: string;
}

export const defaultViewOptions: ViewOptions = {
  mode: "cluster",
  hiddenKinds: new Set(),
  problemsOnly: false,
  hideInactiveReplicaSets: true,
  aggregatePods: true,
  expanded: new Set(),
  collapsedGroups: new Set(),
  groupBy: "namespace",
  maxNodes: 1500,
  search: "",
};

export type ViewRole = "focus" | "dependency" | "impact";

export interface ViewNode {
  readonly id: string;
  /** The resource, or the first member of an aggregate or group. */
  readonly node: GraphNode;
  readonly kind: string;
  readonly label: string;
  readonly health: Health;
  readonly tier: number;
  readonly group: string;
  /** Members of an aggregate or a collapsed group. */
  readonly members?: readonly string[];
  readonly healthCounts?: Readonly<Partial<Record<Health, number>>>;
  readonly type: "resource" | "aggregate" | "group";
  readonly matched: boolean;
  readonly role?: ViewRole;
}

export interface ViewEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly relation: Relation;
  readonly provenance: Provenance;
  readonly evidence: string;
  readonly broken: boolean;
  /** How many graph edges this one stands for. */
  readonly count: number;
  readonly role?: "dependency" | "impact";
  /** Not in the graph: stands for an owner chain whose middle is hidden. */
  readonly bridged?: boolean;
}

export interface ViewGroup {
  readonly id: string;
  readonly label: string;
  readonly collapsed: boolean;
  readonly size: number;
  readonly problems: number;
}

export interface GraphView {
  readonly nodes: readonly ViewNode[];
  readonly edges: readonly ViewEdge[];
  readonly groups: readonly ViewGroup[];
  /** Nodes left out to stay under `maxNodes`. */
  readonly truncated: number;
  /** Nodes of the view before the limit. */
  readonly total: number;
  /** Ids of view nodes that match the search. */
  readonly matches: readonly string[];
}

const clusterGroup = "Cluster-scoped";
const unscheduledGroup = "Not scheduled";

const isInactiveReplicaSet = (node: GraphNode) => node.kind === "ReplicaSet" && /^0\/0 /.test(node.status ?? "");

const searchMatcher = (search: string) => {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);

  if (!terms.length) return undefined;

  return (node: GraphNode) => {
    const haystack = [
      node.name,
      node.kind,
      node.namespace ?? "",
      node.status ?? "",
      ...Object.entries(node.labels).map(([key, value]) => `${key}=${value}`),
    ]
      .join(" ")
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  };
};

const groupKeyOf = (node: GraphNode, groupBy: GroupBy, nodeOfPod?: string): string => {
  switch (groupBy) {
    case "namespace":
      return node.namespace ?? clusterGroup;
    case "node":
      if (node.kind === "Node") return node.name;
      if (node.kind === "Pod") return nodeOfPod ?? node.nodeName ?? unscheduledGroup;

      return node.namespace ? "Workloads" : clusterGroup;
    default:
      return "";
  }
};

const provenanceStrength: Record<Provenance, number> = { inferred: 0, referenced: 1, observed: 2 };

/**
 * Chooses, aggregates and groups what the graph shows for a mode and the
 * user's filters. The graph itself is not changed.
 */
export const selectView = (graph: ArchitectureGraph, options: ViewOptions): GraphView => {
  const { mode, analysis } = options;
  const kinds = modeKinds[mode];
  const included = new Set<string>();

  for (const node of graph.nodes.values()) {
    if (kinds && !kinds.has(node.kind)) continue;
    if (options.hiddenKinds.has(node.kind)) continue;
    if (options.hideInactiveReplicaSets && isInactiveReplicaSet(node)) continue;

    if (mode === "application") {
      if (!analysis || !(analysis.dependencies.has(node.id) || analysis.impact.has(node.id))) continue;
    } else if (mode === "namespace") {
      if (node.namespace !== options.namespace) continue;
    }

    included.add(node.id);
  }

  // In the namespace view, cluster-scoped neighbours of its resources.
  if (mode === "namespace") {
    for (const edge of graph.edges) {
      for (const [inside, outside] of [
        [edge.source, edge.target],
        [edge.target, edge.source],
      ]) {
        const other = graph.nodes.get(outside);

        if (included.has(inside) && other && !other.namespace && !options.hiddenKinds.has(other.kind)) {
          included.add(outside);
        }
      }
    }
  }

  // Edges between included nodes, plus owner chains whose middle is hidden.
  const ownersOf = new Map<string, GraphEdge[]>();

  for (const edge of graph.edges) {
    if (edge.relation === "owns") {
      const list = ownersOf.get(edge.target);

      if (list) {
        list.push(edge);
      } else {
        ownersOf.set(edge.target, [edge]);
      }
    }
  }

  interface Candidate {
    source: string;
    target: string;
    relation: Relation;
    provenance: Provenance;
    evidence: string;
    broken: boolean;
    graphEdge?: string;
    bridged?: boolean;
  }

  const candidates: Candidate[] = [];

  for (const edge of graph.edges) {
    if (included.has(edge.source) && included.has(edge.target)) {
      candidates.push({ ...edge, broken: edge.broken === true, graphEdge: edge.id });
    }
  }

  for (const id of included) {
    const owners = ownersOf.get(id) ?? [];

    if (owners.some((edge) => included.has(edge.source))) continue;

    // Walk up hidden owners to the nearest shown one.
    const chain: string[] = [];
    let current: string | undefined = owners[0]?.source;

    for (let depth = 0; current && depth < 6; depth += 1) {
      const node = graph.nodes.get(current);

      if (included.has(current)) {
        candidates.push({
          source: current,
          target: id,
          relation: "owns",
          provenance: "observed",
          evidence: `owner chain through ${chain.join(" → ")}`,
          broken: false,
          bridged: true,
        });
        break;
      }

      chain.push(`${node?.kind ?? "?"} ${node?.name ?? current}`);
      current = ownersOf.get(current)?.[0]?.source;
    }
  }

  // Problems, with their direct neighbours for context.
  if (options.problemsOnly) {
    const keep = new Set<string>();

    for (const id of included) {
      const node = graph.nodes.get(id);

      if (node && isProblem(node.health)) keep.add(id);
    }

    const problems = new Set(keep);

    for (const edge of candidates) {
      if (problems.has(edge.source)) keep.add(edge.target);
      if (problems.has(edge.target)) keep.add(edge.source);
    }

    for (const id of [...included]) {
      if (!keep.has(id)) included.delete(id);
    }
  }

  // A placeholder only matters as the end of an edge.
  const connected = new Set<string>();

  for (const edge of candidates) {
    if (included.has(edge.source) && included.has(edge.target)) {
      connected.add(edge.source);
      connected.add(edge.target);
    }
  }

  for (const id of [...included]) {
    if (graph.nodes.get(id)?.placeholder && !connected.has(id)) included.delete(id);
  }

  const visibleCandidates = candidates.filter((edge) => included.has(edge.source) && included.has(edge.target));
  const focus = analysis?.focus;
  const matcher = searchMatcher(options.search);

  // Pods of the same shown owner (and node, when grouped by node) become one node.
  const representative = new Map<string, string>();
  const aggregates = new Map<string, string[]>();

  if (options.aggregatePods) {
    const ownerOfPod = new Map<string, string>();

    for (const edge of visibleCandidates) {
      if (edge.relation === "owns" && graph.nodes.get(edge.target)?.kind === "Pod") {
        ownerOfPod.set(edge.target, edge.source);
      }
    }

    const byKey = new Map<string, string[]>();

    for (const [podId, ownerId] of ownerOfPod) {
      if (podId === focus) continue;

      const pod = graph.nodes.get(podId);
      const key = options.groupBy === "node" ? `agg|${ownerId}|${pod?.nodeName ?? ""}` : `agg|${ownerId}`;
      const list = byKey.get(key);

      if (list) {
        list.push(podId);
      } else {
        byKey.set(key, [podId]);
      }
    }

    for (const [key, members] of byKey) {
      if (members.length < 2 || options.expanded.has(key)) continue;

      aggregates.set(key, members.sort());

      for (const member of members) {
        representative.set(member, key);
      }
    }
  }

  // View nodes.
  const viewNodes = new Map<string, ViewNode>();
  const roleOf = (id: string): ViewRole | undefined => {
    if (!analysis) return undefined;
    if (id === analysis.focus) return "focus";
    if (analysis.dependencies.has(id)) return "dependency";
    if (analysis.impact.has(id)) return "impact";

    return undefined;
  };

  for (const id of included) {
    if (representative.has(id)) continue;

    const node = graph.nodes.get(id) as GraphNode;

    viewNodes.set(id, {
      id,
      node,
      kind: node.kind,
      label: node.name,
      health: node.health,
      tier: tierOf(node.kind),
      group: groupKeyOf(node, options.groupBy),
      type: "resource",
      matched: matcher?.(node) ?? false,
      role: roleOf(id),
    });
  }

  for (const [key, members] of aggregates) {
    const nodes = members.map((member) => graph.nodes.get(member) as GraphNode);
    const counts: Partial<Record<Health, number>> = {};
    let health: Health = "healthy";

    for (const node of nodes) {
      counts[node.health] = (counts[node.health] ?? 0) + 1;
      health = worse(health, node.health);
    }

    viewNodes.set(key, {
      id: key,
      node: nodes[0],
      kind: "Pod",
      label: `${members.length} pods`,
      health,
      tier: tierOf("Pod"),
      group: groupKeyOf(nodes[0], options.groupBy, options.groupBy === "node" ? nodes[0].nodeName : undefined),
      members,
      healthCounts: counts,
      type: "aggregate",
      matched: matcher ? nodes.some(matcher) : false,
      role: members.map(roleOf).find(Boolean),
    });
  }

  // Limit the number of nodes: the focus, problems and matches first.
  const total = viewNodes.size;
  let truncated = 0;

  if (viewNodes.size > options.maxNodes) {
    const ranked = [...viewNodes.values()].sort(
      (a, b) =>
        Number(b.role === "focus") - Number(a.role === "focus") ||
        Number(b.matched) - Number(a.matched) ||
        healthRank(b.health) - healthRank(a.health) ||
        a.tier - b.tier ||
        a.id.localeCompare(b.id),
    );

    for (const dropped of ranked.slice(options.maxNodes)) {
      viewNodes.delete(dropped.id);
      truncated += 1;
    }
  }

  // Collapsed groups become one node each.
  const groupMembers = new Map<string, ViewNode[]>();

  for (const node of viewNodes.values()) {
    const list = groupMembers.get(node.group);

    if (list) {
      list.push(node);
    } else {
      groupMembers.set(node.group, [node]);
    }
  }

  const groupRepresentative = new Map<string, string>();
  const groups: ViewGroup[] = [];

  for (const [group, members] of groupMembers) {
    const problems = members.filter((member) => isProblem(member.health)).length;
    const collapsed = group !== "" && options.collapsedGroups.has(group);

    groups.push({ id: group, label: group, collapsed, size: members.length, problems });

    if (!collapsed) continue;

    const groupId = `group|${group}`;
    const counts: Partial<Record<Health, number>> = {};
    let health: Health = "healthy";

    for (const member of members) {
      counts[member.health] = (counts[member.health] ?? 0) + 1;
      health = worse(health, member.health);
      groupRepresentative.set(member.id, groupId);
      viewNodes.delete(member.id);
    }

    viewNodes.set(groupId, {
      id: groupId,
      node: members[0].node,
      kind: "Group",
      label: `${group}: ${members.length} resources`,
      health,
      tier: tierOf("Deployment"),
      group,
      members: members.flatMap((member) => member.members ?? [member.id]),
      healthCounts: counts,
      type: "group",
      matched: members.some((member) => member.matched),
      role: members.map((member) => member.role).find(Boolean),
    });
  }

  groups.sort((a, b) => Number(b.id === clusterGroup) - Number(a.id === clusterGroup) || a.id.localeCompare(b.id));

  // View edges, deduplicated after aggregation.
  const resolve = (id: string) => {
    const aggregate = representative.get(id) ?? id;

    return groupRepresentative.get(aggregate) ?? aggregate;
  };
  const viewEdges = new Map<string, ViewEdge & { evidenceLines: string[] }>();

  for (const edge of visibleCandidates) {
    const source = resolve(edge.source);
    const target = resolve(edge.target);

    if (source === target || !viewNodes.has(source) || !viewNodes.has(target)) continue;

    const id = `${edge.relation}|${source}|${target}`;
    const existing = viewEdges.get(id);
    const role = edge.graphEdge
      ? analysis?.dependencyEdges.has(edge.graphEdge)
        ? "dependency"
        : analysis?.impactEdges.has(edge.graphEdge)
          ? "impact"
          : undefined
      : undefined;

    if (existing) {
      if (existing.evidenceLines.length < 3 && !existing.evidenceLines.includes(edge.evidence)) {
        existing.evidenceLines.push(edge.evidence);
      }

      viewEdges.set(id, {
        ...existing,
        count: existing.count + 1,
        broken: existing.broken || edge.broken,
        provenance:
          provenanceStrength[edge.provenance] > provenanceStrength[existing.provenance]
            ? edge.provenance
            : existing.provenance,
        role: existing.role ?? role,
      });
    } else {
      viewEdges.set(id, {
        id,
        source,
        target,
        relation: edge.relation,
        provenance: edge.provenance,
        evidence: edge.evidence,
        evidenceLines: [edge.evidence],
        broken: edge.broken,
        count: 1,
        role,
        bridged: edge.bridged,
      });
    }
  }

  // In the network view a Service's observed pods are shown through its
  // EndpointSlices; the direct edges add only the pods they do not list.
  const edges: ViewEdge[] = [];
  const servicesWithSlices = new Set(
    [...viewEdges.values()].filter((edge) => edge.relation === "endpoints").map((edge) => edge.source),
  );

  for (const { evidenceLines, ...edge } of viewEdges.values()) {
    const throughSlices =
      mode === "network" &&
      edge.relation === "selects" &&
      edge.provenance === "observed" &&
      servicesWithSlices.has(edge.source);

    if (throughSlices) continue;

    edges.push({
      ...edge,
      evidence:
        edge.count > evidenceLines.length
          ? `${evidenceLines.join("; ")}; and ${edge.count - evidenceLines.length} more`
          : evidenceLines.join("; "),
    });
  }

  const nodes = [...viewNodes.values()];

  return {
    nodes,
    edges,
    groups: groups.filter((group) => group.id !== "" || nodes.length > 0),
    truncated,
    total,
    matches: nodes.filter((node) => node.matched).map((node) => node.id),
  };
};
