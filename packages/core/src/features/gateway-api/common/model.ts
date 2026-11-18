/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { gatewayApiGroup } from "./kinds";

/** The parts of a Kubernetes object the Gateway API views read. */
export interface GatewayApiObject {
  readonly apiVersion?: string;
  readonly kind?: string;
  readonly metadata: {
    readonly name: string;
    readonly namespace?: string;
    readonly uid?: string;
    readonly selfLink?: string;
    readonly labels?: Readonly<Record<string, string>>;
    readonly annotations?: Readonly<Record<string, string>>;
    readonly resourceVersion?: string;
    readonly generation?: number;
  };
  readonly spec?: unknown;
  readonly status?: unknown;
}

export interface Condition {
  readonly type: string;
  readonly status: string;
  readonly reason?: string;
  readonly message?: string;
  readonly lastTransitionTime?: string;
  readonly observedGeneration?: number;
}

export type Health = "healthy" | "warning" | "critical" | "unknown" | "missing";

type AnyRecord = Record<string, unknown>;

export const record = (value: unknown): AnyRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};

export const list = (value: unknown): AnyRecord[] => (Array.isArray(value) ? value.map(record) : []);

export const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export const groupOf = (apiVersion: string | undefined) =>
  apiVersion?.includes("/") ? apiVersion.slice(0, apiVersion.indexOf("/")) : "";

export const specOf = (object: GatewayApiObject) => record(object.spec);
export const statusOf = (object: GatewayApiObject) => record(object.status);

export const toConditions = (value: unknown): Condition[] =>
  list(value)
    .filter((condition) => str(condition.type) && str(condition.status))
    .map((condition) => ({
      type: condition.type as string,
      status: condition.status as string,
      reason: str(condition.reason),
      message: str(condition.message),
      lastTransitionTime: str(condition.lastTransitionTime),
      observedGeneration: num(condition.observedGeneration),
    }));

export const conditionsOf = (object: GatewayApiObject) => toConditions(statusOf(object).conditions);

export const findCondition = (conditions: readonly Condition[], type: string) =>
  conditions.find((condition) => condition.type === type);

/**
 * The health of a set of conditions. `Accepted`, `Programmed` and
 * `ResolvedRefs` are positive polarity: `False` is a problem. Conditions whose
 * `observedGeneration` lags the object are stale, which is reported as unknown.
 */
export const healthOfConditions = (conditions: readonly Condition[], generation?: number): Health => {
  if (conditions.length === 0) return "unknown";

  const accepted = findCondition(conditions, "Accepted");

  if (accepted?.status === "False") return "critical";

  const programmed = findCondition(conditions, "Programmed");

  if (programmed?.status === "False") return "critical";

  const resolved = findCondition(conditions, "ResolvedRefs");

  if (resolved?.status === "False") return "warning";

  const conflicted = findCondition(conditions, "Conflicted");

  if (conflicted?.status === "True") return "warning";

  if (
    generation !== undefined &&
    conditions.some(
      (condition) => condition.observedGeneration !== undefined && condition.observedGeneration < generation,
    )
  ) {
    return "unknown";
  }

  if (conditions.some((condition) => condition.status === "Unknown")) return "unknown";

  return accepted || programmed ? "healthy" : "unknown";
};

export const describeConditions = (conditions: readonly Condition[]) =>
  conditions
    .filter((condition) => condition.status !== "True" || condition.reason)
    .map((condition) => `${condition.type}=${condition.status}${condition.reason ? ` (${condition.reason})` : ""}`)
    .join(", ");

// ---------------------------------------------------------------------------
// GatewayClass

export interface GatewayClassInfo {
  readonly controllerName?: string;
  readonly description?: string;
  readonly parametersRef?: { group?: string; kind?: string; name?: string; namespace?: string };
  readonly conditions: Condition[];
  readonly supportedFeatures: string[];
}

export const gatewayClassInfo = (object: GatewayApiObject): GatewayClassInfo => {
  const spec = specOf(object);
  const parameters = record(spec.parametersRef);
  const features = list(statusOf(object).supportedFeatures)
    .map((feature) => str(feature.name))
    .filter((name): name is string => Boolean(name));

  return {
    controllerName: str(spec.controllerName),
    description: str(spec.description),
    parametersRef: str(parameters.name)
      ? {
          group: str(parameters.group),
          kind: str(parameters.kind),
          name: str(parameters.name),
          namespace: str(parameters.namespace),
        }
      : undefined,
    conditions: conditionsOf(object),
    supportedFeatures: features.length ? features : strings(statusOf(object).supportedFeatures),
  };
};

// ---------------------------------------------------------------------------
// Gateways and listeners

export interface ListenerTls {
  mode?: string;
  certificateRefs: { group?: string; kind?: string; name: string; namespace?: string }[];
  options?: Record<string, string>;
}

export interface Listener {
  name: string;
  hostname?: string;
  port: number;
  protocol: string;
  tls?: ListenerTls;
  allowedRoutes?: {
    namespaces?: { from?: string; selector?: unknown };
    kinds?: { group?: string; kind: string }[];
  };
}

export interface ListenerStatus {
  readonly name: string;
  readonly attachedRoutes: number;
  readonly supportedKinds: string[];
  readonly conditions: Condition[];
}

export const toListener = (value: AnyRecord): Listener => {
  const tls = record(value.tls);
  const allowed = record(value.allowedRoutes);
  const namespaces = record(allowed.namespaces);
  const hasTls = Object.keys(tls).length > 0;
  const hasAllowed = Object.keys(allowed).length > 0;

  return {
    name: str(value.name) ?? "",
    hostname: str(value.hostname),
    port: num(value.port) ?? 0,
    protocol: str(value.protocol) ?? "",
    tls: hasTls
      ? {
          mode: str(tls.mode),
          certificateRefs: list(tls.certificateRefs).map((ref) => ({
            group: typeof ref.group === "string" ? ref.group : undefined,
            kind: str(ref.kind),
            name: str(ref.name) ?? "",
            namespace: str(ref.namespace),
          })),
          options: Object.keys(record(tls.options)).length
            ? (record(tls.options) as Record<string, string>)
            : undefined,
        }
      : undefined,
    allowedRoutes: hasAllowed
      ? {
          namespaces: Object.keys(namespaces).length
            ? { from: str(namespaces.from), selector: namespaces.selector }
            : undefined,
          kinds: list(allowed.kinds).length
            ? list(allowed.kinds).map((kind) => ({ group: str(kind.group), kind: str(kind.kind) ?? "" }))
            : undefined,
        }
      : undefined,
  };
};

/** A listener as the API expects it, without empty fields. */
export const fromListener = (listener: Listener): AnyRecord => {
  const result: AnyRecord = { name: listener.name, port: listener.port, protocol: listener.protocol };

  if (listener.hostname) result.hostname = listener.hostname;

  if (listener.tls) {
    const tls: AnyRecord = {};

    if (listener.tls.mode) tls.mode = listener.tls.mode;

    if (listener.tls.certificateRefs.length) {
      tls.certificateRefs = listener.tls.certificateRefs.map((ref) => {
        const out: AnyRecord = { name: ref.name };

        if (ref.group !== undefined) out.group = ref.group;
        if (ref.kind) out.kind = ref.kind;
        if (ref.namespace) out.namespace = ref.namespace;

        return out;
      });
    }

    if (listener.tls.options) tls.options = listener.tls.options;

    result.tls = tls;
  }

  if (listener.allowedRoutes) {
    const allowed: AnyRecord = {};

    if (listener.allowedRoutes.namespaces?.from) {
      allowed.namespaces = {
        from: listener.allowedRoutes.namespaces.from,
        ...(listener.allowedRoutes.namespaces.selector ? { selector: listener.allowedRoutes.namespaces.selector } : {}),
      };
    }

    if (listener.allowedRoutes.kinds?.length) {
      allowed.kinds = listener.allowedRoutes.kinds.map((kind) =>
        kind.group === undefined ? { kind: kind.kind } : { group: kind.group, kind: kind.kind },
      );
    }

    if (Object.keys(allowed).length) result.allowedRoutes = allowed;
  }

  return result;
};

export interface GatewayInfo {
  readonly className?: string;
  readonly listeners: Listener[];
  readonly specAddresses: string[];
  readonly addresses: string[];
  readonly conditions: Condition[];
  readonly listenerStatuses: ListenerStatus[];
}

export const listenerStatusesOf = (object: GatewayApiObject): ListenerStatus[] =>
  list(statusOf(object).listeners).map((listener) => ({
    name: str(listener.name) ?? "",
    attachedRoutes: num(listener.attachedRoutes) ?? 0,
    supportedKinds: list(listener.supportedKinds)
      .map((kind) => str(kind.kind))
      .filter((kind): kind is string => Boolean(kind)),
    conditions: toConditions(listener.conditions),
  }));

const addressValues = (value: unknown) =>
  list(value)
    .map((address) => str(address.value))
    .filter((address): address is string => Boolean(address));

export const gatewayInfo = (object: GatewayApiObject): GatewayInfo => {
  const spec = specOf(object);

  return {
    className: str(spec.gatewayClassName),
    listeners: list(spec.listeners).map(toListener),
    specAddresses: addressValues(spec.addresses),
    addresses: addressValues(statusOf(object).addresses),
    conditions: conditionsOf(object),
    listenerStatuses: listenerStatusesOf(object),
  };
};

export const attachedRoutesOf = (object: GatewayApiObject) =>
  listenerStatusesOf(object).reduce((sum, listener) => sum + listener.attachedRoutes, 0);

// ---------------------------------------------------------------------------
// Routes

export interface ParentRef {
  readonly group: string;
  readonly kind: string;
  readonly name: string;
  readonly namespace: string;
  readonly sectionName?: string;
  readonly port?: number;
}

export const toParentRef = (value: AnyRecord, defaultNamespace: string): ParentRef => ({
  group: typeof value.group === "string" ? value.group : gatewayApiGroup,
  kind: str(value.kind) ?? "Gateway",
  name: str(value.name) ?? "",
  namespace: str(value.namespace) ?? defaultNamespace,
  sectionName: str(value.sectionName),
  port: num(value.port),
});

export const sameParent = (a: ParentRef, b: ParentRef) =>
  a.group === b.group &&
  a.kind === b.kind &&
  a.name === b.name &&
  a.namespace === b.namespace &&
  a.sectionName === b.sectionName &&
  a.port === b.port;

export interface RouteParentStatus {
  readonly parentRef: ParentRef;
  readonly controllerName?: string;
  readonly conditions: Condition[];
}

export const parentRefsOf = (object: GatewayApiObject): ParentRef[] =>
  list(specOf(object).parentRefs).map((ref) => toParentRef(ref, object.metadata.namespace ?? "default"));

export const routeParentStatusesOf = (object: GatewayApiObject): RouteParentStatus[] =>
  list(statusOf(object).parents).map((parent) => ({
    parentRef: toParentRef(record(parent.parentRef), object.metadata.namespace ?? "default"),
    controllerName: str(parent.controllerName),
    conditions: toConditions(parent.conditions),
  }));

/** The status the controllers report for one parent of a route. */
export const statusForParent = (object: GatewayApiObject, parent: ParentRef) =>
  routeParentStatusesOf(object).filter((status) => sameParent(status.parentRef, parent));

export type RouteState = "accepted" | "rejected" | "unresolved" | "pending";

/** How the parents of a route treat it, the worst first. */
export const routeStateFor = (object: GatewayApiObject, parent?: ParentRef): RouteState => {
  const statuses = parent ? statusForParent(object, parent) : routeParentStatusesOf(object);

  if (statuses.length === 0) return "pending";

  const conditions = statuses.flatMap((status) => status.conditions);

  if (conditions.some((condition) => condition.type === "Accepted" && condition.status === "False")) return "rejected";

  if (conditions.some((condition) => condition.type === "ResolvedRefs" && condition.status === "False"))
    return "unresolved";

  if (conditions.some((condition) => condition.type === "Accepted" && condition.status === "True")) return "accepted";

  return "pending";
};

export const routeStateHealth: Record<RouteState, Health> = {
  accepted: "healthy",
  rejected: "critical",
  unresolved: "warning",
  pending: "unknown",
};

export const hostnamesOf = (object: GatewayApiObject) => strings(specOf(object).hostnames);

export interface BackendRef {
  readonly group: string;
  readonly kind: string;
  readonly name: string;
  readonly namespace: string;
  readonly port?: number;
  readonly weight: number;
}

export const toBackendRef = (value: AnyRecord, defaultNamespace: string): BackendRef => ({
  group: typeof value.group === "string" ? value.group : "",
  kind: str(value.kind) ?? "Service",
  name: str(value.name) ?? "",
  namespace: str(value.namespace) ?? defaultNamespace,
  port: num(value.port),
  weight: num(value.weight) ?? 1,
});

export const rulesOf = (object: GatewayApiObject) => list(specOf(object).rules);

/** Every backend of every rule, with the rule it belongs to. */
export const backendRefsOf = (object: GatewayApiObject) =>
  rulesOf(object).flatMap((rule, ruleIndex) => {
    const refs = list(rule.backendRefs).map((ref) => toBackendRef(ref, object.metadata.namespace ?? "default"));
    const total = refs.reduce((sum, ref) => sum + ref.weight, 0);

    return refs.map((ref) => ({
      ...ref,
      ruleIndex,
      /** The share of the rule's traffic, 0 to 100, when the rule has weights. */
      share: total > 0 ? Math.round((ref.weight / total) * 100) : 0,
    }));
  });

// HTTPRoute rules, in a shape the visual editor edits.

export interface HttpMatch {
  path?: { type: string; value: string };
  headers: { type: string; name: string; value: string }[];
  queryParams: { type: string; name: string; value: string }[];
  method?: string;
}

export interface HttpFilter {
  type: string;
  raw: AnyRecord;
}

export interface HttpRule {
  name?: string;
  matches: HttpMatch[];
  filters: HttpFilter[];
  backendRefs: { name: string; namespace?: string; port?: number; weight?: number; kind?: string; group?: string }[];
  timeouts?: { request?: string; backendRequest?: string };
  /** Fields the editor does not edit, kept as they are. */
  rest: AnyRecord;
}

const toNameValue = (value: AnyRecord, defaultType: string) => ({
  type: str(value.type) ?? defaultType,
  name: str(value.name) ?? "",
  value: typeof value.value === "string" ? value.value : "",
});

export const toHttpRule = (value: AnyRecord): HttpRule => {
  const { name, matches, filters, backendRefs, timeouts, ...rest } = value;
  const timeoutRecord = record(timeouts);

  return {
    name: str(name),
    matches: list(matches).map((match) => {
      const path = record(match.path);

      return {
        path: Object.keys(path).length
          ? { type: str(path.type) ?? "PathPrefix", value: typeof path.value === "string" ? path.value : "/" }
          : undefined,
        headers: list(match.headers).map((header) => toNameValue(header, "Exact")),
        queryParams: list(match.queryParams).map((query) => toNameValue(query, "Exact")),
        method: str(match.method),
      };
    }),
    filters: list(filters).map((filter) => ({ type: str(filter.type) ?? "", raw: filter })),
    backendRefs: list(backendRefs).map((ref) => ({
      name: str(ref.name) ?? "",
      namespace: str(ref.namespace),
      port: num(ref.port),
      weight: num(ref.weight),
      kind: str(ref.kind),
      group: typeof ref.group === "string" ? ref.group : undefined,
      ...(ref.filters ? { filters: ref.filters } : {}),
    })),
    timeouts: Object.keys(timeoutRecord).length
      ? { request: str(timeoutRecord.request), backendRequest: str(timeoutRecord.backendRequest) }
      : undefined,
    rest,
  };
};

export const fromHttpRule = (rule: HttpRule): AnyRecord => {
  const result: AnyRecord = { ...rule.rest };

  if (rule.name) result.name = rule.name;

  if (rule.matches.length) {
    result.matches = rule.matches.map((match) => {
      const out: AnyRecord = {};

      if (match.path) out.path = { type: match.path.type, value: match.path.value };
      if (match.headers.length)
        out.headers = match.headers.map((h) => ({ type: h.type, name: h.name, value: h.value }));
      if (match.queryParams.length)
        out.queryParams = match.queryParams.map((q) => ({ type: q.type, name: q.name, value: q.value }));
      if (match.method) out.method = match.method;

      return out;
    });
  }

  if (rule.filters.length) result.filters = rule.filters.map((filter) => filter.raw);

  if (rule.backendRefs.length) {
    result.backendRefs = rule.backendRefs.map((ref) => {
      const { name, namespace, port, weight, kind, group, ...others } = ref as typeof ref & AnyRecord;
      const out: AnyRecord = { ...others, name };

      if (group !== undefined) out.group = group;
      if (kind) out.kind = kind;
      if (namespace) out.namespace = namespace;
      if (port !== undefined) out.port = port;
      if (weight !== undefined) out.weight = weight;

      return out;
    });
  }

  if (rule.timeouts && (rule.timeouts.request || rule.timeouts.backendRequest)) {
    result.timeouts = {
      ...(rule.timeouts.request ? { request: rule.timeouts.request } : {}),
      ...(rule.timeouts.backendRequest ? { backendRequest: rule.timeouts.backendRequest } : {}),
    };
  }

  return result;
};

export const describeHttpMatch = (match: HttpMatch) => {
  const parts: string[] = [];

  if (match.method) parts.push(match.method);
  if (match.path)
    parts.push(
      `${match.path.type === "Exact" ? "=" : match.path.type === "RegularExpression" ? "~" : ""}${match.path.value}${match.path.type === "PathPrefix" ? "*" : ""}`,
    );
  for (const header of match.headers)
    parts.push(`${header.name}${header.type === "RegularExpression" ? "~" : "="}${header.value}`);
  for (const query of match.queryParams)
    parts.push(`?${query.name}${query.type === "RegularExpression" ? "~" : "="}${query.value}`);

  return parts.join(" ") || "/*";
};

/** A short text for a filter of an HTTPRoute or GRPCRoute rule. */
export const describeFilter = (filter: AnyRecord) => {
  const type = str(filter.type) ?? "Unknown";

  switch (type) {
    case "RequestRedirect": {
      const redirect = record(filter.requestRedirect);
      const path = record(redirect.path);
      const target = [
        str(redirect.scheme) ? `${redirect.scheme}://` : "",
        str(redirect.hostname) ?? "",
        num(redirect.port) ? `:${redirect.port}` : "",
        str(path.replaceFullPath) ?? str(path.replacePrefixMatch) ?? "",
      ].join("");

      return `Redirect ${num(redirect.statusCode) ?? 302}${target ? ` → ${target}` : ""}`;
    }
    case "URLRewrite": {
      const rewrite = record(filter.urlRewrite);
      const path = record(rewrite.path);
      const parts = [
        str(rewrite.hostname) ? `host ${rewrite.hostname}` : "",
        str(path.replaceFullPath) ? `path ${path.replaceFullPath}` : "",
        str(path.replacePrefixMatch) ? `prefix ${path.replacePrefixMatch}` : "",
      ].filter(Boolean);

      return `Rewrite ${parts.join(", ")}`.trim();
    }
    case "RequestHeaderModifier":
    case "ResponseHeaderModifier": {
      const modifier = record(
        filter[type === "RequestHeaderModifier" ? "requestHeaderModifier" : "responseHeaderModifier"],
      );
      const count = list(modifier.set).length + list(modifier.add).length + strings(modifier.remove).length;

      return `${type === "RequestHeaderModifier" ? "Request" : "Response"} headers (${count})`;
    }
    case "RequestMirror": {
      const backend = record(record(filter.requestMirror).backendRef);

      return `Mirror → ${str(backend.name) ?? "?"}${num(backend.port) ? `:${backend.port}` : ""}`;
    }
    case "ExtensionRef": {
      const ref = record(filter.extensionRef);

      return `Extension ${str(ref.kind) ?? ""}/${str(ref.name) ?? ""}`;
    }
    default:
      return type;
  }
};

// GRPCRoute

export const describeGrpcMatch = (match: AnyRecord) => {
  const method = record(match.method);
  const service = str(method.service) ?? "*";
  const name = str(method.method) ?? "*";
  const headers = list(match.headers).map((header) => `${str(header.name) ?? ""}=${str(header.value) ?? ""}`);
  const type = str(method.type) === "RegularExpression" ? "~" : "";

  return [`${type}${service}/${name}`, ...headers].join(" ");
};

// TLSRoute SNI matching: a route hostname matches a listener hostname when
// either is absent, they are equal, or one is a wildcard covering the other.
export const hostnameMatches = (listenerHostname: string | undefined, routeHostname: string) => {
  if (!listenerHostname) return true;
  if (listenerHostname === routeHostname) return true;

  const covers = (wildcard: string, host: string) =>
    wildcard.startsWith("*.") && host.endsWith(wildcard.slice(1)) && host.length > wildcard.length - 1;

  return covers(listenerHostname, routeHostname) || covers(routeHostname, listenerHostname);
};

export const routeHostnamesIntersect = (listenerHostname: string | undefined, routeHostnames: readonly string[]) =>
  routeHostnames.length === 0 || routeHostnames.some((hostname) => hostnameMatches(listenerHostname, hostname));

// ---------------------------------------------------------------------------
// ReferenceGrant

export interface GrantFrom {
  readonly group: string;
  readonly kind: string;
  readonly namespace: string;
}

export interface GrantTo {
  readonly group: string;
  readonly kind: string;
  readonly name?: string;
}

export const referenceGrantInfo = (object: GatewayApiObject) => {
  const spec = specOf(object);

  return {
    from: list(spec.from).map(
      (from): GrantFrom => ({
        group: typeof from.group === "string" ? from.group : "",
        kind: str(from.kind) ?? "",
        namespace: str(from.namespace) ?? "",
      }),
    ),
    to: list(spec.to).map(
      (to): GrantTo => ({
        group: typeof to.group === "string" ? to.group : "",
        kind: str(to.kind) ?? "",
        name: str(to.name),
      }),
    ),
  };
};

export interface CrossNamespaceReference {
  readonly fromGroup: string;
  readonly fromKind: string;
  readonly fromNamespace: string;
  readonly toGroup: string;
  readonly toKind: string;
  readonly toName: string;
  readonly toNamespace: string;
}

/**
 * Whether a reference across namespaces is permitted: a ReferenceGrant in the
 * namespace of the target has to list the source in `from` and the target in
 * `to`. A reference within a namespace needs none.
 */
export const isReferenceGranted = (grants: readonly GatewayApiObject[], reference: CrossNamespaceReference) => {
  if (reference.fromNamespace === reference.toNamespace) return true;

  return grants
    .filter((grant) => grant.metadata.namespace === reference.toNamespace)
    .some((grant) => {
      const { from, to } = referenceGrantInfo(grant);

      return (
        from.some(
          (entry) =>
            entry.group === reference.fromGroup &&
            entry.kind === reference.fromKind &&
            entry.namespace === reference.fromNamespace,
        ) &&
        to.some(
          (entry) =>
            entry.group === reference.toGroup &&
            entry.kind === reference.toKind &&
            (!entry.name || entry.name === reference.toName),
        )
      );
    });
};

// ---------------------------------------------------------------------------
// BackendTLSPolicy

export const backendTlsPolicyInfo = (object: GatewayApiObject) => {
  const spec = specOf(object);
  const validation = record(spec.validation);
  const namespace = object.metadata.namespace ?? "default";

  return {
    targetRefs: list(spec.targetRefs).map((ref) => ({
      group: typeof ref.group === "string" ? ref.group : "",
      kind: str(ref.kind) ?? "Service",
      name: str(ref.name) ?? "",
      namespace,
      sectionName: str(ref.sectionName),
    })),
    hostname: str(validation.hostname),
    caCertificateRefs: list(validation.caCertificateRefs).map((ref) => ({
      kind: str(ref.kind) ?? "ConfigMap",
      name: str(ref.name) ?? "",
    })),
    wellKnownCACertificates: str(validation.wellKnownCACertificates),
    subjectAltNames: list(validation.subjectAltNames).map(
      (san) => str(san.hostname) ?? str(san.uri) ?? str(san.type) ?? "",
    ),
    ancestors: list(statusOf(object).ancestors).map((ancestor) => ({
      ancestorRef: toParentRef(record(ancestor.ancestorRef), namespace),
      controllerName: str(ancestor.controllerName),
      conditions: toConditions(ancestor.conditions),
    })),
  };
};

// ---------------------------------------------------------------------------
// ListenerSet

export const listenerSetInfo = (object: GatewayApiObject) => {
  const spec = specOf(object);

  return {
    parentRef: toParentRef(record(spec.parentRef), object.metadata.namespace ?? "default"),
    listeners: list(spec.listeners).map(toListener),
    conditions: conditionsOf(object),
    listenerStatuses: listenerStatusesOf(object),
  };
};

// ---------------------------------------------------------------------------

/** The parents of an object of any kind, for the "Parents" column. */
export const describeParents = (object: GatewayApiObject) =>
  parentRefsOf(object)
    .map(
      (parent) =>
        `${parent.namespace !== object.metadata.namespace ? `${parent.namespace}/` : ""}${parent.name}${parent.sectionName ? `:${parent.sectionName}` : ""}`,
    )
    .join(", ");
