/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/** The API group of the Gateway API, standard and experimental channels alike. */
export const gatewayApiGroup = "gateway.networking.k8s.io";

/**
 * The group of resources the experimental channel ships before they reach the
 * standard group, such as `XListenerSet`.
 */
export const gatewayApiExperimentalGroup = "gateway.networking.x-k8s.io";

export const gatewayApiGroups: readonly string[] = [gatewayApiGroup, gatewayApiExperimentalGroup];

export type GatewayApiResourceId =
  | "gatewayclasses"
  | "gateways"
  | "httproutes"
  | "grpcroutes"
  | "tcproutes"
  | "tlsroutes"
  | "udproutes"
  | "referencegrants"
  | "backendtlspolicies"
  | "listenersets";

/** A place the cluster may serve a resource from: the group, its plural and kind there. */
export interface GatewayApiCandidate {
  readonly group: string;
  readonly plural: string;
  readonly kind: string;
}

export interface GatewayApiKindDefinition {
  /** The key of the resource in routes and sidebar ids. */
  readonly id: GatewayApiResourceId;
  /** The kind in the standard group. */
  readonly kind: string;
  readonly title: string;
  readonly namespaced: boolean;
  /** Material icon name. */
  readonly icon: string;
  /** Where the cluster may serve it, the most preferred first. */
  readonly candidates: readonly GatewayApiCandidate[];
  /** Route kinds attach to listeners. */
  readonly isRoute: boolean;
  readonly description: string;
}

const standard = (plural: string, kind: string): GatewayApiCandidate => ({ group: gatewayApiGroup, plural, kind });

export const gatewayApiKinds: readonly GatewayApiKindDefinition[] = [
  {
    id: "gatewayclasses",
    kind: "GatewayClass",
    title: "Gateway Classes",
    namespaced: false,
    icon: "category",
    candidates: [standard("gatewayclasses", "GatewayClass")],
    isRoute: false,
    description: "Templates for Gateways, implemented by a controller.",
  },
  {
    id: "gateways",
    kind: "Gateway",
    title: "Gateways",
    namespaced: true,
    icon: "router",
    candidates: [standard("gateways", "Gateway")],
    isRoute: false,
    description: "Load balancers with listeners that routes attach to.",
  },
  {
    id: "httproutes",
    kind: "HTTPRoute",
    title: "HTTP Routes",
    namespaced: true,
    icon: "alt_route",
    candidates: [standard("httproutes", "HTTPRoute")],
    isRoute: true,
    description: "HTTP and HTTPS routing rules.",
  },
  {
    id: "grpcroutes",
    kind: "GRPCRoute",
    title: "GRPC Routes",
    namespaced: true,
    icon: "settings_ethernet",
    candidates: [standard("grpcroutes", "GRPCRoute")],
    isRoute: true,
    description: "gRPC service and method routing.",
  },
  {
    id: "tcproutes",
    kind: "TCPRoute",
    title: "TCP Routes",
    namespaced: true,
    icon: "cable",
    candidates: [standard("tcproutes", "TCPRoute")],
    isRoute: true,
    description: "Layer 4 TCP forwarding (experimental channel).",
  },
  {
    id: "tlsroutes",
    kind: "TLSRoute",
    title: "TLS Routes",
    namespaced: true,
    icon: "lock",
    candidates: [standard("tlsroutes", "TLSRoute")],
    isRoute: true,
    description: "TLS passthrough and termination routed by SNI.",
  },
  {
    id: "udproutes",
    kind: "UDPRoute",
    title: "UDP Routes",
    namespaced: true,
    icon: "podcasts",
    candidates: [standard("udproutes", "UDPRoute")],
    isRoute: true,
    description: "Layer 4 UDP forwarding (experimental channel).",
  },
  {
    id: "referencegrants",
    kind: "ReferenceGrant",
    title: "Reference Grants",
    namespaced: true,
    icon: "handshake",
    candidates: [standard("referencegrants", "ReferenceGrant")],
    isRoute: false,
    description: "Permissions for references across namespaces.",
  },
  {
    id: "backendtlspolicies",
    kind: "BackendTLSPolicy",
    title: "Backend TLS Policies",
    namespaced: true,
    icon: "verified_user",
    candidates: [standard("backendtlspolicies", "BackendTLSPolicy")],
    isRoute: false,
    description: "TLS from the Gateway to the backends.",
  },
  {
    id: "listenersets",
    kind: "ListenerSet",
    title: "Listener Sets",
    namespaced: true,
    icon: "hearing",
    candidates: [
      standard("listenersets", "ListenerSet"),
      { group: gatewayApiExperimentalGroup, plural: "xlistenersets", kind: "XListenerSet" },
    ],
    isRoute: false,
    description: "Listeners merged into a Gateway from other namespaces.",
  },
];

export const routeKinds: readonly string[] = gatewayApiKinds.filter((kind) => kind.isRoute).map((kind) => kind.kind);

export const getGatewayApiKind = (id: string) => gatewayApiKinds.find((kind) => kind.id === id);

/** The definition of the kind of an object, by its group and kind. */
export const getGatewayApiKindOf = (apiVersion: string | undefined, kind: string | undefined) => {
  if (!apiVersion || !kind) return undefined;

  const group = apiVersion.includes("/") ? apiVersion.slice(0, apiVersion.indexOf("/")) : "";

  return gatewayApiKinds.find((definition) =>
    definition.candidates.some((candidate) => candidate.group === group && candidate.kind === kind),
  );
};

/** Protocols each kind of route attaches to. */
export const routeProtocols: Readonly<Record<string, readonly string[]>> = {
  HTTPRoute: ["HTTP", "HTTPS"],
  GRPCRoute: ["HTTP", "HTTPS"],
  TLSRoute: ["TLS"],
  TCPRoute: ["TCP"],
  UDPRoute: ["UDP"],
};

export const listenerProtocols: readonly string[] = ["HTTP", "HTTPS", "TLS", "TCP", "UDP"];

export const gatewayApiInstallUrl = "https://gateway-api.sigs.k8s.io/guides/#installing-gateway-api";
