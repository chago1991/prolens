/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import { apiBasesOf, discoverGatewayApi, findResourceStatus, isSupported } from "../discovery";
import { gatewayApiExperimentalGroup, gatewayApiGroup, getGatewayApiKindOf } from "../kinds";

import type { DiscoveredResource, GatewayApiCrdInfo } from "../discovery";

const resource = (apiName: string, kind: string, version: string, group = gatewayApiGroup, namespaced = true) =>
  ({ group, version, apiName, kind, namespaced }) satisfies DiscoveredResource;

const crd = (
  plural: string,
  annotations: Record<string, string> = {},
  established?: boolean,
  group = gatewayApiGroup,
) => ({ group, plural, annotations, established, servedVersions: [] }) satisfies GatewayApiCrdInfo;

const allowAll = () => true;

describe("discoverGatewayApi", () => {
  it("reports nothing installed without Gateway API resources in discovery", () => {
    const discovery = discoverGatewayApi({
      knownResources: [resource("pods", "Pod", "v1", "")],
      isAllowed: allowAll,
      crds: [],
    });

    expect(discovery.installed).toBe(false);
    expect(discovery.resources.every((status) => status.state === "not-installed")).toBe(true);
  });

  it("takes the preferred version from the order of discovery, not a fixed version", () => {
    const discovery = discoverGatewayApi({
      knownResources: [
        resource("tlsroutes", "TLSRoute", "v1alpha3"),
        resource("tlsroutes", "TLSRoute", "v1alpha2"),
        resource("httproutes", "HTTPRoute", "v1"),
        resource("httproutes", "HTTPRoute", "v1beta1"),
        resource("httproutes/status", "HTTPRoute", "v1"),
      ],
      isAllowed: allowAll,
      crds: [],
    });

    const tls = findResourceStatus(discovery, "tlsroutes");
    const http = findResourceStatus(discovery, "httproutes");

    expect(tls?.version).toBe("v1alpha3");
    expect(tls?.versions).toEqual(["v1alpha3", "v1alpha2"]);
    expect(http?.version).toBe("v1");
    expect(apiBasesOf(http!)).toEqual([
      "/apis/gateway.networking.k8s.io/v1/httproutes",
      "/apis/gateway.networking.k8s.io/v1beta1/httproutes",
    ]);
  });

  it("does not show a resource RBAC refuses to list", () => {
    const discovery = discoverGatewayApi({
      knownResources: [resource("gateways", "Gateway", "v1"), resource("httproutes", "HTTPRoute", "v1")],
      isAllowed: (_group, plural) => plural !== "gateways",
      crds: [],
    });

    expect(findResourceStatus(discovery, "gateways")?.state).toBe("forbidden");
    expect(isSupported(discovery, "gateways")).toBe(false);
    expect(isSupported(discovery, "httproutes")).toBe(true);
  });

  it("does not trust a definition that is not established", () => {
    const discovery = discoverGatewayApi({
      knownResources: [resource("grpcroutes", "GRPCRoute", "v1")],
      isAllowed: allowAll,
      crds: [crd("grpcroutes", {}, false)],
    });

    expect(findResourceStatus(discovery, "grpcroutes")?.state).toBe("not-established");
  });

  it("does not show a definition that discovery does not serve", () => {
    const discovery = discoverGatewayApi({
      knownResources: [],
      isAllowed: allowAll,
      crds: [crd("gateways", {}, true)],
    });

    expect(findResourceStatus(discovery, "gateways")?.state).toBe("not-installed");
    expect(discovery.installed).toBe(false);
  });

  it("finds ListenerSets in the experimental group", () => {
    const discovery = discoverGatewayApi({
      knownResources: [resource("xlistenersets", "XListenerSet", "v1alpha1", gatewayApiExperimentalGroup)],
      isAllowed: allowAll,
      crds: [
        crd(
          "xlistenersets",
          { "gateway.networking.k8s.io/channel": "experimental" },
          true,
          gatewayApiExperimentalGroup,
        ),
      ],
    });

    const status = findResourceStatus(discovery, "listenersets");

    expect(status?.state).toBe("supported");
    expect(status?.kind).toBe("XListenerSet");
    expect(status?.channel).toBe("experimental");
    expect(getGatewayApiKindOf(`${gatewayApiExperimentalGroup}/v1alpha1`, "XListenerSet")?.id).toBe("listenersets");
  });

  it("prefers the standard ListenerSet when both are served", () => {
    const discovery = discoverGatewayApi({
      knownResources: [
        resource("listenersets", "ListenerSet", "v1"),
        resource("xlistenersets", "XListenerSet", "v1alpha1", gatewayApiExperimentalGroup),
      ],
      isAllowed: allowAll,
      crds: [],
    });

    expect(findResourceStatus(discovery, "listenersets")?.group).toBe(gatewayApiGroup);
  });

  it("reads channel and bundle version from the definitions", () => {
    const annotations = {
      "gateway.networking.k8s.io/channel": "standard",
      "gateway.networking.k8s.io/bundle-version": "v1.4.0",
    };
    const discovery = discoverGatewayApi({
      knownResources: [
        resource("gateways", "Gateway", "v1"),
        resource("gatewayclasses", "GatewayClass", "v1", gatewayApiGroup, false),
      ],
      isAllowed: allowAll,
      crds: [crd("gateways", annotations, true), crd("gatewayclasses", annotations, true)],
    });

    expect(discovery.channel).toBe("standard");
    expect(discovery.bundleVersion).toBe("v1.4.0");
    expect(findResourceStatus(discovery, "gatewayclasses")?.namespaced).toBe(false);
  });
});
