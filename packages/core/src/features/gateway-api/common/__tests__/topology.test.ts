/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import { buildTopology, layoutTopology } from "../topology";
import {
  endpointSlice,
  gateway,
  gatewayClass,
  httpRoute,
  object,
  orphanRoute,
  pod,
  referenceGrant,
  rejectedRoute,
  service,
} from "./fixtures";

import type { GatewayApiObject } from "../model";
import type { TopologyInput } from "../topology";

const input = (overrides: Partial<TopologyInput> = {}): TopologyInput => ({
  gatewayClasses: [gatewayClass],
  gateways: [gateway],
  routes: [httpRoute],
  referenceGrants: [],
  services: [service("shop-v1", "apps"), service("shop-v2", "apps"), service("api", "backend", 80)],
  endpointSlices: [endpointSlice("shop-v1", "apps", [{ name: "shop-1", ready: true }]) as unknown as GatewayApiObject],
  pods: [pod("shop-1", "apps")],
  ...overrides,
});

const edge = (graph: ReturnType<typeof buildTopology>, source: string, target: string) =>
  graph.edges.find((candidate) => candidate.source === source && candidate.target === target);

describe("buildTopology", () => {
  it("connects GatewayClass → Gateway → Listener → Route → Service → EndpointSlice → Pod", () => {
    const graph = buildTopology(input());

    expect(edge(graph, "GatewayClass:cilium", "Gateway:infra/web")).toBeDefined();
    expect(edge(graph, "Gateway:infra/web", "Listener:infra/web#http")).toBeDefined();
    expect(edge(graph, "Listener:infra/web#http", "HTTPRoute:apps/shop")).toBeDefined();
    // sectionName "http" selects only that listener.
    expect(edge(graph, "Listener:infra/web#https", "HTTPRoute:apps/shop")).toBeUndefined();
    expect(edge(graph, "HTTPRoute:apps/shop", "Service:apps/shop-v1")?.label).toBe("90% :8080");
    expect(edge(graph, "Service:apps/shop-v1", "EndpointSlice:apps/shop-v1-abc")).toBeDefined();
    expect(edge(graph, "EndpointSlice:apps/shop-v1-abc", "Pod:apps/shop-1")).toBeDefined();
  });

  it("marks cross-namespace backends without a ReferenceGrant as broken", () => {
    const broken = buildTopology(input());
    const granted = buildTopology(input({ referenceGrants: [referenceGrant] }));

    expect(edge(broken, "HTTPRoute:apps/shop", "Service:backend/api")?.broken).toBe(true);
    expect(edge(granted, "HTTPRoute:apps/shop", "Service:backend/api")?.broken).toBe(false);
  });

  it("highlights rejected routes, missing backends and missing gateways", () => {
    const graph = buildTopology(input({ routes: [rejectedRoute, orphanRoute] }));
    const node = (id: string) => graph.nodes.find((candidate) => candidate.id === id);

    expect(node("HTTPRoute:apps/blocked")?.health).toBe("critical");
    expect(node("Service:apps/missing")?.missing).toBe(true);
    expect(edge(graph, "HTTPRoute:apps/blocked", "Service:apps/missing")?.broken).toBe(true);
    expect(node("Gateway:apps/nope")?.health).toBe("missing");
    expect(graph.problems).toBeGreaterThan(0);
  });

  it("flags services without ready endpoints", () => {
    const graph = buildTopology(input());

    expect(graph.nodes.find((node) => node.id === "Service:apps/shop-v2")?.health).toBe("warning");
    expect(graph.nodes.find((node) => node.id === "Service:apps/shop-v1")?.health).toBe("healthy");
  });

  it("marks a missing GatewayClass", () => {
    const graph = buildTopology(input({ gatewayClasses: [] }));

    expect(graph.nodes.find((node) => node.id === "GatewayClass:cilium")?.missing).toBe(true);
    expect(edge(graph, "GatewayClass:cilium", "Gateway:infra/web")?.broken).toBe(true);
  });

  it("matches listeners by protocol when no section is named", () => {
    const tlsRoute = object(
      "TLSRoute",
      "sni",
      "infra",
      { parentRefs: [{ name: "web" }], hostnames: ["db.example.com"] },
      undefined,
      {},
      "gateway.networking.k8s.io/v1alpha2",
    );
    const graph = buildTopology(input({ routes: [tlsRoute] }));

    expect(edge(graph, "Listener:infra/web#tls", "TLSRoute:infra/sni")).toBeDefined();
    expect(edge(graph, "Listener:infra/web#http", "TLSRoute:infra/sni")).toBeUndefined();
  });

  it("filters by gateway and limits the size", () => {
    const other = object("Gateway", "internal", "infra", {
      gatewayClassName: "cilium",
      listeners: [{ name: "a", port: 80, protocol: "HTTP" }],
    });
    const focused = buildTopology(input({ gateways: [gateway, other] }), { gateway: "infra/internal" });

    expect(focused.nodes.some((node) => node.id === "Gateway:infra/web")).toBe(false);
    expect(focused.nodes.some((node) => node.id === "Gateway:infra/internal")).toBe(true);

    const limited = buildTopology(input(), { maxNodes: 3 });

    expect(limited.nodes).toHaveLength(3);
    expect(limited.truncated).toBeGreaterThan(0);
    expect(limited.nodes.every((node) => ["GatewayClass", "Gateway", "Listener"].includes(node.kind))).toBe(true);
  });

  it("scales to large clusters", () => {
    const routes = Array.from({ length: 2000 }, (_, index) =>
      object("HTTPRoute", `r${index}`, "apps", {
        parentRefs: [{ name: "web", namespace: "infra", sectionName: "http" }],
        rules: [{ backendRefs: [{ name: `s${index}`, port: 80 }] }],
      }),
    );
    const services = routes.map((_, index) => service(`s${index}`, "apps", 80));
    const started = performance.now();
    const graph = buildTopology(input({ routes, services }), { maxNodes: 5000 });

    layoutTopology(graph);
    expect(graph.nodes.length).toBeGreaterThan(4000);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe("layoutTopology", () => {
  it("places tiers in columns from left to right", () => {
    const graph = buildTopology(input());
    const positions = layoutTopology(graph);

    const x = (id: string) => positions.get(id)?.x ?? -1;

    expect(x("GatewayClass:cilium")).toBeLessThan(x("Gateway:infra/web"));
    expect(x("Gateway:infra/web")).toBeLessThan(x("Listener:infra/web#http"));
    expect(x("HTTPRoute:apps/shop")).toBeLessThan(x("Service:apps/shop-v1"));
    expect(positions.size).toBe(graph.nodes.length);
  });
});
