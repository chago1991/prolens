/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import { ciliumGatewayResourceName, detectCilium, hubbleObserveCommand } from "../cilium";
import {
  attachedRoutesOf,
  backendRefsOf,
  backendTlsPolicyInfo,
  describeFilter,
  describeHttpMatch,
  fromHttpRule,
  fromListener,
  gatewayClassInfo,
  gatewayInfo,
  healthOfConditions,
  hostnameMatches,
  isReferenceGranted,
  routeStateFor,
  rulesOf,
  toHttpRule,
} from "../model";
import { looksLikeProduction } from "../safety";
import { renderTemplate } from "../templates";
import { gateway, gatewayClass, httpRoute, object, referenceGrant, rejectedRoute } from "./fixtures";

describe("Gateway API resource model", () => {
  it("reads a GatewayClass", () => {
    expect(gatewayClassInfo(gatewayClass).controllerName).toBe("io.cilium/gateway-controller");
    expect(healthOfConditions(gatewayClassInfo(gatewayClass).conditions)).toBe("healthy");
  });

  it("reads gateways, listeners and their status", () => {
    const info = gatewayInfo(gateway);

    expect(info.className).toBe("cilium");
    expect(info.addresses).toEqual(["10.0.0.10"]);
    expect(info.listeners.map((listener) => listener.name)).toEqual(["http", "https", "tls"]);
    expect(info.listeners[1].tls?.certificateRefs[0].name).toBe("cert");
    expect(attachedRoutesOf(gateway)).toBe(2);
  });

  it("writes listeners back without empty fields", () => {
    const [http, https] = gatewayInfo(gateway).listeners;

    expect(fromListener(http)).toEqual({
      name: "http",
      port: 80,
      protocol: "HTTP",
      allowedRoutes: { namespaces: { from: "All" } },
    });
    expect(fromListener(https)).toEqual({
      name: "https",
      port: 443,
      protocol: "HTTPS",
      hostname: "*.example.com",
      tls: { mode: "Terminate", certificateRefs: [{ name: "cert" }] },
    });
  });

  it("reports the state of routes per parent", () => {
    expect(routeStateFor(httpRoute)).toBe("unresolved");
    expect(routeStateFor(rejectedRoute)).toBe("rejected");
    expect(routeStateFor(object("HTTPRoute", "new", "apps", {}))).toBe("pending");
  });

  it("computes backend shares from weights", () => {
    const refs = backendRefsOf(httpRoute);

    expect(refs.map((ref) => [ref.name, ref.share])).toEqual([
      ["shop-v1", 90],
      ["shop-v2", 10],
      ["api", 100],
    ]);
    expect(refs[2].namespace).toBe("backend");
  });

  it("round-trips HTTP rules through the editor model", () => {
    const rule = {
      name: "main",
      matches: [{ path: { type: "Exact", value: "/a" }, headers: [{ name: "x-v", value: "2" }], method: "GET" }],
      filters: [{ type: "URLRewrite", urlRewrite: { path: { type: "ReplacePrefixMatch", replacePrefixMatch: "/b" } } }],
      backendRefs: [{ name: "svc", port: 80, weight: 5 }],
      timeouts: { request: "10s" },
      sessionPersistence: { type: "Cookie" },
    };

    expect(fromHttpRule(toHttpRule(rule))).toEqual({
      ...rule,
      matches: [
        { path: { type: "Exact", value: "/a" }, headers: [{ type: "Exact", name: "x-v", value: "2" }], method: "GET" },
      ],
    });
  });

  it("describes matches and filters", () => {
    const [rule] = rulesOf(httpRoute).map(toHttpRule);

    expect(describeHttpMatch(rule.matches[0])).toBe("/*");
    expect(describeFilter({ type: "RequestRedirect", requestRedirect: { scheme: "https", statusCode: 301 } })).toBe(
      "Redirect 301 → https://",
    );
    expect(describeFilter({ type: "RequestMirror", requestMirror: { backendRef: { name: "m", port: 81 } } })).toBe(
      "Mirror → m:81",
    );
  });

  it("matches SNI hostnames with wildcards", () => {
    expect(hostnameMatches("*.example.com", "shop.example.com")).toBe(true);
    expect(hostnameMatches("*.example.com", "example.com")).toBe(false);
    expect(hostnameMatches(undefined, "anything")).toBe(true);
    expect(hostnameMatches("a.example.com", "*.example.com")).toBe(true);
  });

  it("checks references across namespaces against ReferenceGrants", () => {
    const reference = {
      fromGroup: "gateway.networking.k8s.io",
      fromKind: "HTTPRoute",
      fromNamespace: "apps",
      toGroup: "",
      toKind: "Service",
      toName: "api",
      toNamespace: "backend",
    };

    expect(isReferenceGranted([], reference)).toBe(false);
    expect(isReferenceGranted([referenceGrant], reference)).toBe(true);
    expect(isReferenceGranted([referenceGrant], { ...reference, fromNamespace: "other" })).toBe(false);
    expect(isReferenceGranted([], { ...reference, toNamespace: "apps" })).toBe(true);
  });

  it("reads BackendTLSPolicies", () => {
    const policy = object("BackendTLSPolicy", "tls", "apps", {
      targetRefs: [{ group: "", kind: "Service", name: "api" }],
      validation: { hostname: "api.internal", wellKnownCACertificates: "System" },
    });
    const info = backendTlsPolicyInfo(policy);

    expect(info.targetRefs[0]).toMatchObject({ kind: "Service", name: "api", namespace: "apps" });
    expect(info.hostname).toBe("api.internal");
    expect(info.wellKnownCACertificates).toBe("System");
  });
});

describe("Cilium detection", () => {
  it("detects Cilium as the controller and Hubble when present", () => {
    const integration = detectCilium({
      gatewayClasses: [gatewayClass],
      knownResources: [
        {
          group: "cilium.io",
          version: "v2",
          apiName: "ciliumenvoyconfigs",
          kind: "CiliumEnvoyConfig",
          namespaced: true,
        },
      ],
      services: [{ metadata: { name: "hubble-ui", namespace: "kube-system" } }],
    });

    expect(integration.isGatewayController).toBe(true);
    expect(integration.envoyConfigsAvailable).toBe(true);
    expect(integration.networkPoliciesAvailable).toBe(false);
    expect(integration.hubbleUi?.metadata.name).toBe("hubble-ui");
    expect(integration.hubbleRelay).toBeUndefined();
    expect(ciliumGatewayResourceName("web")).toBe("cilium-gateway-web");
    expect(hubbleObserveCommand("infra", "web")).toContain("--to-service infra/cilium-gateway-web");
  });

  it("assumes nothing on a cluster without Cilium", () => {
    const integration = detectCilium({
      gatewayClasses: [
        object("GatewayClass", "envoy", undefined, { controllerName: "gateway.envoyproxy.io/gatewayclass-controller" }),
      ],
      knownResources: [],
      services: [],
    });

    expect(integration.isGatewayController).toBe(false);
    expect(integration.ciliumInstalled).toBe(false);
  });
});

describe("Safety", () => {
  it("recognises production targets", () => {
    expect(looksLikeProduction({ clusterName: "eu-prod-1" })).toBe(true);
    expect(looksLikeProduction({ namespace: "production" })).toBe(true);
    expect(looksLikeProduction({ labels: { environment: "prod" } })).toBe(true);
    expect(looksLikeProduction({ clusterName: "kind-dev", namespace: "products" })).toBe(false);
  });
});

describe("Templates", () => {
  it("renders the version the cluster serves", () => {
    const yaml = renderTemplate({
      id: "tlsroutes",
      apiVersion: "gateway.networking.k8s.io/v1alpha3",
      kind: "TLSRoute",
      namespace: "apps",
      gatewayName: "web",
    });

    expect(yaml).toContain("apiVersion: gateway.networking.k8s.io/v1alpha3");
    expect(yaml).toContain("namespace: apps");
    expect(yaml).toContain("- name: web");
  });

  it("renders no namespace for GatewayClasses", () => {
    expect(
      renderTemplate({
        id: "gatewayclasses",
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "GatewayClass",
        namespace: "x",
      }),
    ).not.toContain("namespace:");
  });
});
