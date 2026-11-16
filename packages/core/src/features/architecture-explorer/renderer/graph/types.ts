/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * How a relationship is known.
 *
 * - `observed`: recorded by the cluster itself: an owner reference, the node a
 *   pod runs on, an endpoint of an EndpointSlice, the volume a claim is bound
 *   to, a route accepted by its gateway.
 * - `referenced`: a name written in a spec, such as the ConfigMap a pod mounts
 *   or the Service an Ingress routes to. The target may not exist.
 * - `inferred`: worked out by ProLens, from label selectors or defaults, such
 *   as a Service selecting pods that are not among its endpoints.
 */
export type Provenance = "observed" | "referenced" | "inferred";

/**
 * - `unknown`: there is no information, for example a kind ProLens does not
 *   load, or a reference into a namespace that is not loaded.
 * - `missing`: referenced, but the cluster has no such object, and the kind
 *   and namespace were loaded, so its absence is known.
 */
export type Health = "healthy" | "warning" | "critical" | "unknown" | "missing";

export type Relation =
  /** An owner reference: the source owns the target. */
  | "owns"
  /** A pod runs on a node. */
  | "runs-on"
  /** A Service selects a pod, or an EndpointSlice lists it. */
  | "selects"
  /** A Service's EndpointSlice. */
  | "endpoints"
  /** An Ingress or a route sends traffic to a Service. */
  | "routes-to"
  /** A gateway carries a route. */
  | "attaches"
  /** An IngressClass, GatewayClass or StorageClass. */
  | "class"
  /** A workload or pod uses a ConfigMap, Secret or claim as a volume. */
  | "mounts"
  /** A workload or pod reads a ConfigMap or Secret into its environment. */
  | "env"
  /** A workload or pod runs as a ServiceAccount. */
  | "service-account"
  /** A workload or pod pulls images with a Secret. */
  | "pull-secret"
  /** A claim is bound to a volume. */
  | "binds"
  /** A network policy selects a pod. */
  | "applies-to";

export interface GraphNode {
  /** Stable across updates: group, kind, namespace and name. */
  readonly id: string;
  readonly kind: string;
  readonly group: string;
  readonly apiVersion: string;
  readonly name: string;
  readonly namespace?: string;
  readonly uid?: string;
  readonly selfLink?: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly health: Health;
  /** Why the health is what it is, one finding per entry. */
  readonly reasons: readonly string[];
  /** Short status, for example "2/3 ready" or "Bound". */
  readonly status?: string;
  /** Set when the object is not known to the cluster, or could not be checked. */
  readonly placeholder?: "missing" | "unverified" | "not-loaded";
  /** The node a pod runs on, used for grouping. */
  readonly nodeName?: string;
  /** Facts that are not problems, such as the rules of a network policy. */
  readonly details: readonly string[];
  readonly warningEvents: readonly GraphEvent[];
}

export interface GraphEvent {
  readonly reason: string;
  readonly message: string;
  readonly count: number;
  readonly lastSeen?: string;
}

export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly relation: Relation;
  readonly provenance: Provenance;
  /** Where the relationship comes from, in words a user can check. */
  readonly evidence: string;
  /** The target is missing or rejected the reference. */
  readonly broken?: boolean;
}

export interface ArchitectureGraph {
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly edges: readonly GraphEdge[];
}

/** The parts of a Kubernetes object the graph reads. KubeObjects satisfy it. */
export interface ResourceObject {
  readonly kind: string;
  readonly apiVersion: string;
  readonly metadata: {
    readonly name: string;
    readonly namespace?: string;
    readonly uid?: string;
    readonly selfLink?: string;
    readonly labels?: Partial<Record<string, string>>;
    readonly annotations?: Partial<Record<string, string>>;
    readonly ownerReferences?: readonly OwnerReference[];
    readonly deletionTimestamp?: string;
  };
  readonly spec?: unknown;
  readonly status?: unknown;
}

export interface OwnerReference {
  readonly apiVersion: string;
  readonly kind: string;
  readonly name: string;
  readonly uid: string;
  readonly controller?: boolean;
}

export interface ResourceEvent {
  readonly type?: string;
  readonly reason?: string;
  readonly message?: string;
  readonly count?: number;
  readonly lastTimestamp?: string;
  readonly eventTime?: string;
  readonly involvedObject: {
    readonly kind?: string;
    readonly name?: string;
    readonly namespace?: string;
    readonly uid?: string;
  };
}

/**
 * What the snapshot holds. A reference to an object that is not in the
 * snapshot is `missing` only when its kind and namespace were loaded.
 */
export interface Coverage {
  isLoaded(group: string, kind: string, namespace?: string): boolean;
}

export interface ClusterSnapshot {
  readonly objects: readonly ResourceObject[];
  readonly events: readonly ResourceEvent[];
  readonly coverage: Coverage;
}
