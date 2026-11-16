/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { healthRank, isProblem } from "./health";

import type { ArchitectureGraph, GraphEdge, Health, Relation } from "./types";

/**
 * Which end of an edge needs the other. For most relations the source needs
 * the target: a Deployment needs its pods, a pod its node, an Ingress its
 * Service. A route needs the gateway that carries it, and a pod is subject to
 * the policies that select it.
 */
const dependentIsTarget: ReadonlySet<Relation> = new Set<Relation>(["attaches", "applies-to"]);

export const dependencyOf = (edge: GraphEdge): { dependent: string; dependency: string } =>
  dependentIsTarget.has(edge.relation)
    ? { dependent: edge.target, dependency: edge.source }
    : { dependent: edge.source, dependency: edge.target };

export interface Finding {
  readonly nodeId: string;
  readonly health: Health;
  /** A problem none of whose own dependencies has a problem. */
  readonly rootCause: boolean;
  /** Hops from the focus. */
  readonly distance: number;
  /** Node ids from the focus to this node. */
  readonly path: readonly string[];
  readonly evidence: readonly string[];
}

export interface NetworkNote {
  readonly policyId: string;
  readonly podId: string;
  readonly note: string;
}

export interface Analysis {
  readonly focus: string;
  /** What the focus needs, directly or not, the focus included. */
  readonly dependencies: ReadonlySet<string>;
  /** What would be affected by a change of the focus, the focus included. */
  readonly impact: ReadonlySet<string>;
  readonly findings: readonly Finding[];
  readonly networkNotes: readonly NetworkNote[];
  /** Edges along the way from the focus to each dependency. */
  readonly dependencyEdges: ReadonlySet<string>;
  readonly impactEdges: ReadonlySet<string>;
}

interface Adjacency {
  dependsOn: Map<string, GraphEdge[]>;
  dependedOnBy: Map<string, GraphEdge[]>;
  ownersOf: Map<string, GraphEdge[]>;
  ownedBy: Map<string, GraphEdge[]>;
}

const push = (map: Map<string, GraphEdge[]>, key: string, edge: GraphEdge) => {
  const list = map.get(key);

  if (list) {
    list.push(edge);
  } else {
    map.set(key, [edge]);
  }
};

const adjacencyCache = new WeakMap<ArchitectureGraph, Adjacency>();

const adjacencyOf = (graph: ArchitectureGraph): Adjacency => {
  const cached = adjacencyCache.get(graph);

  if (cached) {
    return cached;
  }

  const adjacency: Adjacency = {
    dependsOn: new Map(),
    dependedOnBy: new Map(),
    ownersOf: new Map(),
    ownedBy: new Map(),
  };

  for (const edge of graph.edges) {
    const { dependent, dependency } = dependencyOf(edge);

    push(adjacency.dependsOn, dependent, edge);
    push(adjacency.dependedOnBy, dependency, edge);

    if (edge.relation === "owns") {
      push(adjacency.ownersOf, edge.target, edge);
      push(adjacency.ownedBy, edge.source, edge);
    }
  }

  adjacencyCache.set(graph, adjacency);

  return adjacency;
};

const pathTo = (parents: Map<string, string | undefined>, id: string): string[] => {
  const path: string[] = [];
  let current: string | undefined = id;

  while (current !== undefined) {
    path.unshift(current);
    current = parents.get(current);
  }

  return path;
};

/**
 * What a resource needs, what needs it, and where along its dependencies the
 * problems start.
 *
 * The dependencies of a pod include what its controllers' pod template
 * references, because that is where those references are recorded, but not
 * the controllers' other pods.
 */
export const analyze = (graph: ArchitectureGraph, focus: string): Analysis => {
  const adjacency = adjacencyOf(graph);
  const parents = new Map<string, string | undefined>([[focus, undefined]]);
  const distances = new Map<string, number>([[focus, 0]]);
  const dependencyEdges = new Set<string>();
  // Inherited: reached from a pod or ReplicaSet by going up to its owner.
  const queue: { id: string; inherited: boolean }[] = [{ id: focus, inherited: false }];
  const seen = new Set<string>([`${focus}|false`]);

  while (queue.length) {
    const { id, inherited } = queue.shift() as { id: string; inherited: boolean };
    const distance = distances.get(id) ?? 0;
    const visit = (next: string, edge: GraphEdge, nextInherited: boolean) => {
      const key = `${next}|${nextInherited}`;

      if (seen.has(key)) return;

      seen.add(key);
      dependencyEdges.add(edge.id);

      if (!parents.has(next)) {
        parents.set(next, id);
        distances.set(next, distance + 1);
      }

      queue.push({ id: next, inherited: nextInherited });
    };

    for (const edge of adjacency.dependsOn.get(id) ?? []) {
      if (inherited && edge.relation === "owns") continue;

      visit(dependencyOf(edge).dependency, edge, false);
    }

    for (const edge of adjacency.ownersOf.get(id) ?? []) {
      visit(edge.source, edge, true);
    }
  }

  const dependencies = new Set(parents.keys());

  // Impact: who needs the focus, and what the focus owns, since a change of
  // an owner's template reaches its children.
  const impact = new Set<string>([focus]);
  const impactEdges = new Set<string>();
  const impactQueue = [focus];

  while (impactQueue.length) {
    const id = impactQueue.shift() as string;
    const next = [
      ...(adjacency.dependedOnBy.get(id) ?? []).map((edge) => ({ edge, node: dependencyOf(edge).dependent })),
      ...(adjacency.ownedBy.get(id) ?? []).map((edge) => ({ edge, node: edge.target })),
    ];

    for (const { edge, node } of next) {
      impactEdges.add(edge.id);

      if (!impact.has(node)) {
        impact.add(node);
        impactQueue.push(node);
      }
    }
  }

  // A node's own dependencies and those its owners' templates record for it.
  const effectiveDependencies = (id: string): GraphEdge[] => {
    const result = [...(adjacency.dependsOn.get(id) ?? [])];
    const owners = [...(adjacency.ownersOf.get(id) ?? [])].map((edge) => edge.source);
    const visited = new Set<string>([id]);

    while (owners.length) {
      const owner = owners.shift() as string;

      if (visited.has(owner)) continue;

      visited.add(owner);
      result.push(...(adjacency.dependsOn.get(owner) ?? []).filter((edge) => edge.relation !== "owns"));
      owners.push(...(adjacency.ownersOf.get(owner) ?? []).map((edge) => edge.source));
    }

    return result;
  };

  const findings: Finding[] = [];

  for (const id of dependencies) {
    const node = graph.nodes.get(id);

    if (!node || !isProblem(node.health)) continue;

    const problemDependencies = effectiveDependencies(id).filter((edge) => {
      const dependency = dependencyOf(edge).dependency;
      const target = graph.nodes.get(dependency);

      return dependencies.has(dependency) && target !== undefined && isProblem(target.health);
    });
    const brokenEdges = (adjacency.dependsOn.get(id) ?? []).filter((edge) => edge.broken);

    findings.push({
      nodeId: id,
      health: node.health,
      rootCause: problemDependencies.length === 0,
      distance: distances.get(id) ?? 0,
      path: pathTo(parents, id),
      evidence: [
        ...node.reasons,
        ...brokenEdges.map((edge) => `Broken ${edge.relation} reference: ${edge.evidence}`),
        ...node.warningEvents.map(
          (event) => `Event ${event.reason}${event.count > 1 ? ` ×${event.count}` : ""}: ${event.message}`,
        ),
      ],
    });
  }

  findings.sort(
    (a, b) =>
      Number(b.rootCause) - Number(a.rootCause) ||
      healthRank(b.health) - healthRank(a.health) ||
      b.distance - a.distance ||
      a.nodeId.localeCompare(b.nodeId),
  );

  const networkNotes: NetworkNote[] = [];

  for (const id of dependencies) {
    for (const edge of adjacency.dependsOn.get(id) ?? []) {
      if (edge.relation !== "applies-to") continue;

      const policy = graph.nodes.get(edge.source);

      for (const line of policy?.details ?? []) {
        if (line.includes("all traffic denied")) {
          networkNotes.push({ policyId: edge.source, podId: id, note: `${policy?.kind} ${policy?.name}: ${line}` });
        }
      }
    }
  }

  return { focus, dependencies, impact, findings, networkNotes, dependencyEdges, impactEdges };
};
