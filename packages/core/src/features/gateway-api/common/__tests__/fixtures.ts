/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { GatewayApiObject } from "../model";

const apiVersion = "gateway.networking.k8s.io/v1";

export const object = (
  kind: string,
  name: string,
  namespace: string | undefined,
  spec: unknown,
  status?: unknown,
  extra: Partial<GatewayApiObject["metadata"]> = {},
  version = apiVersion,
): GatewayApiObject => ({
  apiVersion: version,
  kind,
  metadata: {
    name,
    namespace,
    selfLink: `/apis/x/${kind}/${namespace ?? ""}/${name}`,
    generation: 1,
    ...extra,
  },
  spec,
  status,
});

const accepted = [
  { type: "Accepted", status: "True", reason: "Accepted" },
  { type: "Programmed", status: "True", reason: "Programmed" },
];

export const gatewayClass = object(
  "GatewayClass",
  "cilium",
  undefined,
  { controllerName: "io.cilium/gateway-controller" },
  { conditions: [accepted[0]] },
);

export const gateway = object(
  "Gateway",
  "web",
  "infra",
  {
    gatewayClassName: "cilium",
    listeners: [
      { name: "http", port: 80, protocol: "HTTP", allowedRoutes: { namespaces: { from: "All" } } },
      {
        name: "https",
        port: 443,
        protocol: "HTTPS",
        hostname: "*.example.com",
        tls: { mode: "Terminate", certificateRefs: [{ name: "cert" }] },
      },
      { name: "tls", port: 8443, protocol: "TLS", tls: { mode: "Passthrough" } },
    ],
  },
  {
    addresses: [{ type: "IPAddress", value: "10.0.0.10" }],
    conditions: accepted,
    listeners: [
      { name: "http", attachedRoutes: 1, supportedKinds: [{ kind: "HTTPRoute" }], conditions: accepted },
      { name: "https", attachedRoutes: 1, supportedKinds: [{ kind: "HTTPRoute" }], conditions: accepted },
      { name: "tls", attachedRoutes: 0, supportedKinds: [{ kind: "TLSRoute" }], conditions: accepted },
    ],
  },
);

export const httpRoute = object(
  "HTTPRoute",
  "shop",
  "apps",
  {
    parentRefs: [{ name: "web", namespace: "infra", sectionName: "http" }],
    hostnames: ["shop.example.com"],
    rules: [
      {
        matches: [{ path: { type: "PathPrefix", value: "/" } }],
        backendRefs: [
          { name: "shop-v1", port: 8080, weight: 90 },
          { name: "shop-v2", port: 8080, weight: 10 },
        ],
      },
      {
        matches: [{ path: { type: "PathPrefix", value: "/api" } }],
        backendRefs: [{ name: "api", namespace: "backend", port: 80 }],
      },
    ],
  },
  {
    parents: [
      {
        parentRef: { name: "web", namespace: "infra", sectionName: "http" },
        controllerName: "io.cilium/gateway-controller",
        conditions: [
          { type: "Accepted", status: "True", reason: "Accepted" },
          { type: "ResolvedRefs", status: "False", reason: "RefNotPermitted" },
        ],
      },
    ],
  },
);

export const rejectedRoute = object(
  "HTTPRoute",
  "blocked",
  "apps",
  { parentRefs: [{ name: "web", namespace: "infra" }], rules: [{ backendRefs: [{ name: "missing", port: 80 }] }] },
  {
    parents: [
      {
        parentRef: { name: "web", namespace: "infra" },
        controllerName: "io.cilium/gateway-controller",
        conditions: [{ type: "Accepted", status: "False", reason: "NotAllowedByListeners" }],
      },
    ],
  },
);

export const orphanRoute = object("HTTPRoute", "orphan", "apps", {
  parentRefs: [{ name: "nope" }],
  rules: [{ backendRefs: [{ name: "shop-v1", port: 8080 }] }],
});

export const service = (name: string, namespace: string, port = 8080) =>
  object("Service", name, namespace, { type: "ClusterIP", ports: [{ port }] }, undefined, {}, "v1");

export const endpointSlice = (service: string, namespace: string, pods: { name: string; ready: boolean }[]) => ({
  ...object(
    "EndpointSlice",
    `${service}-abc`,
    namespace,
    undefined,
    undefined,
    { labels: { "kubernetes.io/service-name": service } },
    "discovery.k8s.io/v1",
  ),
  endpoints: pods.map((pod) => ({
    conditions: { ready: pod.ready },
    targetRef: { kind: "Pod", name: pod.name, namespace },
  })),
});

export const pod = (name: string, namespace: string, ready = true) =>
  object(
    "Pod",
    name,
    namespace,
    {},
    { phase: "Running", conditions: [{ type: "Ready", status: ready ? "True" : "False" }] },
    {},
    "v1",
  );

export const referenceGrant = object(
  "ReferenceGrant",
  "allow-apps",
  "backend",
  {
    from: [{ group: "gateway.networking.k8s.io", kind: "HTTPRoute", namespace: "apps" }],
    to: [{ group: "", kind: "Service" }],
  },
  undefined,
  {},
  "gateway.networking.k8s.io/v1beta1",
);
