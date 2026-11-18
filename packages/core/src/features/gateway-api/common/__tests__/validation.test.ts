/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import { toHttpRule } from "../model";
import {
  durationToMs,
  validateGatewayApiObject,
  validateHostnames,
  validateHttpRules,
  validateListeners,
} from "../validation";

import type { Listener } from "../model";

const listener = (overrides: Partial<Listener> = {}): Listener => ({
  name: "http",
  port: 80,
  protocol: "HTTP",
  ...overrides,
});
const messages = (issues: { message: string }[]) => issues.map((issue) => issue.message).join("\n");

describe("validateListeners", () => {
  it("accepts a valid listener", () => {
    expect(validateListeners([listener()])).toEqual([]);
  });

  it("requires at least one listener", () => {
    expect(messages(validateListeners([]))).toContain("at least one listener");
  });

  it("rejects duplicate names, bad ports and conflicts", () => {
    const issues = validateListeners([listener(), listener({ port: 0 }), listener({ name: "other" })]);

    expect(messages(issues)).toContain('Name "http" is used twice');
    expect(messages(issues)).toContain("Port must be between 1 and 65535");
    expect(messages(issues)).toContain("they conflict");
  });

  it("requires certificates to terminate TLS", () => {
    expect(messages(validateListeners([listener({ name: "https", protocol: "HTTPS", port: 443 })]))).toContain(
      "certificate reference",
    );
    expect(
      validateListeners([
        listener({
          name: "https",
          protocol: "HTTPS",
          port: 443,
          tls: { mode: "Terminate", certificateRefs: [{ name: "c" }] },
        }),
      ]),
    ).toEqual([]);
    expect(
      validateListeners([
        listener({ name: "tls", protocol: "TLS", port: 443, tls: { mode: "Passthrough", certificateRefs: [] } }),
      ]),
    ).toEqual([]);
  });

  it("rejects hostnames on TCP listeners and invalid hostnames", () => {
    expect(messages(validateListeners([listener({ protocol: "TCP", hostname: "a.b" })]))).toContain("take no hostname");
    expect(messages(validateListeners([listener({ hostname: "Not_Valid" })]))).toContain("not a valid DNS name");
  });
});

describe("validateHttpRules", () => {
  const rule = (value: Record<string, unknown>) => toHttpRule(value);

  it("accepts a valid rule", () => {
    expect(
      validateHttpRules([
        rule({ matches: [{ path: { type: "PathPrefix", value: "/" } }], backendRefs: [{ name: "svc", port: 80 }] }),
      ]),
    ).toEqual([]);
  });

  it("rejects paths without a leading slash and bad regular expressions", () => {
    const issues = validateHttpRules([
      rule({
        matches: [{ path: { type: "PathPrefix", value: "api" } }, { path: { type: "RegularExpression", value: "(" } }],
        backendRefs: [{ name: "svc", port: 80 }],
      }),
    ]);

    expect(messages(issues)).toContain("Path must start with /");
    expect(messages(issues)).toContain("Not a valid regular expression");
  });

  it("requires a port for Service backends and valid weights", () => {
    const issues = validateHttpRules([
      rule({ backendRefs: [{ name: "svc" }, { name: "other", port: 80, weight: -1 }] }),
    ]);

    expect(messages(issues)).toContain("needs a port");
    expect(messages(issues)).toContain("Weight must be");
  });

  it("rejects redirect together with rewrite", () => {
    const issues = validateHttpRules([
      rule({
        filters: [
          { type: "RequestRedirect", requestRedirect: {} },
          { type: "URLRewrite", urlRewrite: {} },
        ],
      }),
    ]);

    expect(messages(issues)).toContain("cannot both redirect and rewrite");
  });

  it("checks timeouts", () => {
    const issues = validateHttpRules([
      rule({ backendRefs: [{ name: "svc", port: 80 }], timeouts: { request: "10s", backendRequest: "1m" } }),
    ]);

    expect(messages(issues)).toContain("cannot be longer than the request timeout");
    expect(
      messages(validateHttpRules([rule({ backendRefs: [{ name: "s", port: 1 }], timeouts: { request: "ten" } })])),
    ).toContain("Use a duration");
    expect(durationToMs("1h30m")).toBe(5_400_000);
    expect(durationToMs("500ms")).toBe(500);
  });

  it("warns when all backends have weight 0", () => {
    expect(messages(validateHttpRules([rule({ backendRefs: [{ name: "s", port: 1, weight: 0 }] })]))).toContain(
      "weight 0",
    );
  });
});

describe("other validation", () => {
  it("validates hostnames", () => {
    expect(validateHostnames(["a.example.com", "*.example.com"])).toEqual([]);
    expect(validateHostnames(["10.0.0.1"])).toHaveLength(1);
  });

  it("validates object basics", () => {
    expect(
      validateGatewayApiObject({
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: { name: "a" },
      }),
    ).toEqual([]);
    expect(validateGatewayApiObject({ apiVersion: "v1", metadata: { name: "A" } })).toHaveLength(3);
  });
});
