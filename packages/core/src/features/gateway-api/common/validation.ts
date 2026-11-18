/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { listenerProtocols } from "./kinds";

import type { HttpRule, Listener } from "./model";

/** A problem with an edited value; `path` points at the field. */
export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

// The patterns of the Gateway API CRD schemas.
const sectionNamePattern = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const hostnamePattern = /^(\*\.)?[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const headerNamePattern = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const durationPattern = /^([0-9]{1,5}(h|m|s|ms)){1,4}$/;
const dnsLabelPattern = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const dnsSubdomainPattern = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

export const isValidHostname = (hostname: string) =>
  hostname.length <= 253 && hostnamePattern.test(hostname) && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname);

export const isValidDuration = (value: string) => durationPattern.test(value);

/** Milliseconds of a Gateway API duration, such as `1h30m` or `500ms`. */
export const durationToMs = (value: string) => {
  let total = 0;

  for (const [, amount, unit] of value.matchAll(/([0-9]+)(h|ms|m|s)/g)) {
    const factor = unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : unit === "s" ? 1000 : 1;

    total += Number(amount) * factor;
  }

  return total;
};

const tlsProtocols = new Set(["HTTPS", "TLS"]);

export const validateListeners = (listeners: readonly Listener[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (listeners.length === 0) {
    issues.push({ path: "listeners", message: "A Gateway needs at least one listener." });
  }

  if (listeners.length > 64) {
    issues.push({ path: "listeners", message: "A Gateway has at most 64 listeners." });
  }

  const names = new Set<string>();
  const combinations = new Set<string>();

  listeners.forEach((listener, index) => {
    const path = `listeners[${index}]`;

    if (!listener.name) {
      issues.push({ path: `${path}.name`, message: "Name is required." });
    } else if (!sectionNamePattern.test(listener.name) || listener.name.length > 253) {
      issues.push({ path: `${path}.name`, message: "Name must be a lowercase DNS label." });
    } else if (names.has(listener.name)) {
      issues.push({ path: `${path}.name`, message: `Name "${listener.name}" is used twice.` });
    }

    names.add(listener.name);

    if (!Number.isInteger(listener.port) || listener.port < 1 || listener.port > 65535) {
      issues.push({ path: `${path}.port`, message: "Port must be between 1 and 65535." });
    }

    if (!listener.protocol) {
      issues.push({ path: `${path}.protocol`, message: "Protocol is required." });
    } else if (!listenerProtocols.includes(listener.protocol) && !listener.protocol.includes("/")) {
      issues.push({
        path: `${path}.protocol`,
        message: `Protocol must be one of ${listenerProtocols.join(", ")}, or a domain-prefixed protocol.`,
      });
    }

    if (listener.hostname) {
      if (!isValidHostname(listener.hostname)) {
        issues.push({ path: `${path}.hostname`, message: "Hostname is not a valid DNS name or wildcard." });
      }

      if (listener.protocol === "TCP" || listener.protocol === "UDP") {
        issues.push({ path: `${path}.hostname`, message: "TCP and UDP listeners take no hostname." });
      }
    }

    if (tlsProtocols.has(listener.protocol)) {
      const mode = listener.tls?.mode ?? "Terminate";

      if (listener.protocol === "HTTPS" && mode === "Passthrough") {
        issues.push({ path: `${path}.tls.mode`, message: "HTTPS listeners terminate TLS; use TLS for passthrough." });
      }

      if (mode === "Terminate" && !listener.tls?.certificateRefs.some((ref) => ref.name)) {
        issues.push({
          path: `${path}.tls.certificateRefs`,
          message: "A listener that terminates TLS needs at least one certificate reference.",
        });
      }
    } else if (
      listener.tls &&
      (listener.protocol === "HTTP" || listener.protocol === "TCP" || listener.protocol === "UDP")
    ) {
      issues.push({ path: `${path}.tls`, message: `A ${listener.protocol} listener takes no TLS configuration.` });
    }

    const combination = `${listener.port}/${listener.protocol}/${listener.hostname ?? ""}`;

    if (combinations.has(combination)) {
      issues.push({
        path: path,
        message: `Another listener has port ${listener.port}, protocol ${listener.protocol} and the same hostname; they conflict.`,
      });
    }

    combinations.add(combination);
  });

  return issues;
};

const pathTypes = new Set(["Exact", "PathPrefix", "RegularExpression"]);
const matchTypes = new Set(["Exact", "RegularExpression"]);
const methods = new Set(["GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"]);

export const validateHttpRules = (rules: readonly HttpRule[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (rules.length > 16) {
    issues.push({ path: "rules", message: "An HTTPRoute has at most 16 rules." });
  }

  const ruleNames = new Set<string>();

  rules.forEach((rule, ruleIndex) => {
    const path = `rules[${ruleIndex}]`;

    if (rule.name) {
      if (!sectionNamePattern.test(rule.name)) {
        issues.push({ path: `${path}.name`, message: "Rule name must be a lowercase DNS label." });
      } else if (ruleNames.has(rule.name)) {
        issues.push({ path: `${path}.name`, message: `Rule name "${rule.name}" is used twice.` });
      }

      ruleNames.add(rule.name);
    }

    if (rule.matches.length > 64) {
      issues.push({ path: `${path}.matches`, message: "A rule has at most 64 matches." });
    }

    rule.matches.forEach((match, matchIndex) => {
      const matchPath = `${path}.matches[${matchIndex}]`;

      if (match.path) {
        if (!pathTypes.has(match.path.type)) {
          issues.push({
            path: `${matchPath}.path.type`,
            message: "Path type must be Exact, PathPrefix or RegularExpression.",
          });
        }

        if (match.path.type !== "RegularExpression" && !match.path.value.startsWith("/")) {
          issues.push({ path: `${matchPath}.path.value`, message: "Path must start with /." });
        }

        if (match.path.type !== "RegularExpression" && /\/\/|\/\.\.?(\/|$)|%2f|%2F|#/.test(match.path.value)) {
          issues.push({ path: `${matchPath}.path.value`, message: "Path must not contain //, /./, /../, %2f or #." });
        }

        if (match.path.type === "RegularExpression") {
          try {
            new RegExp(match.path.value);
          } catch {
            issues.push({ path: `${matchPath}.path.value`, message: "Not a valid regular expression." });
          }
        }
      }

      if (match.method && !methods.has(match.method)) {
        issues.push({ path: `${matchPath}.method`, message: `Method must be one of ${[...methods].join(", ")}.` });
      }

      for (const [kind, entries] of [
        ["headers", match.headers],
        ["queryParams", match.queryParams],
      ] as const) {
        const seen = new Set<string>();

        entries.forEach((entry, entryIndex) => {
          const entryPath = `${matchPath}.${kind}[${entryIndex}]`;

          if (!entry.name) {
            issues.push({ path: `${entryPath}.name`, message: "Name is required." });
          } else if (kind === "headers" && !headerNamePattern.test(entry.name)) {
            issues.push({ path: `${entryPath}.name`, message: "Not a valid header name." });
          }

          if (!matchTypes.has(entry.type)) {
            issues.push({ path: `${entryPath}.type`, message: "Type must be Exact or RegularExpression." });
          }

          const key = kind === "headers" ? entry.name.toLowerCase() : entry.name;

          if (entry.name && seen.has(key)) {
            issues.push({ path: `${entryPath}.name`, message: `"${entry.name}" is matched twice.` });
          }

          seen.add(key);
        });
      }
    });

    const filterTypes = rule.filters.map((filter) => filter.type);

    if (filterTypes.includes("RequestRedirect") && filterTypes.includes("URLRewrite")) {
      issues.push({ path: `${path}.filters`, message: "A rule cannot both redirect and rewrite." });
    }

    for (const unique of ["RequestRedirect", "URLRewrite", "RequestHeaderModifier", "ResponseHeaderModifier"]) {
      if (filterTypes.filter((type) => type === unique).length > 1) {
        issues.push({ path: `${path}.filters`, message: `${unique} can be used once per rule.` });
      }
    }

    if (rule.backendRefs.length === 0 && !filterTypes.includes("RequestRedirect")) {
      issues.push({
        path: `${path}.backendRefs`,
        message: "Without backends and without a redirect, the rule answers every request with 500.",
      });
    }

    rule.backendRefs.forEach((ref, refIndex) => {
      const refPath = `${path}.backendRefs[${refIndex}]`;

      if (!ref.name) {
        issues.push({ path: `${refPath}.name`, message: "Backend name is required." });
      } else if (!dnsSubdomainPattern.test(ref.name)) {
        issues.push({ path: `${refPath}.name`, message: "Backend name must be a lowercase DNS name." });
      }

      if (ref.namespace && !dnsLabelPattern.test(ref.namespace)) {
        issues.push({ path: `${refPath}.namespace`, message: "Namespace must be a DNS label." });
      }

      const isService = (ref.kind ?? "Service") === "Service" && (ref.group ?? "") === "";

      if (isService && ref.port === undefined) {
        issues.push({ path: `${refPath}.port`, message: "A Service backend needs a port." });
      }

      if (ref.port !== undefined && (!Number.isInteger(ref.port) || ref.port < 1 || ref.port > 65535)) {
        issues.push({ path: `${refPath}.port`, message: "Port must be between 1 and 65535." });
      }

      if (ref.weight !== undefined && (!Number.isInteger(ref.weight) || ref.weight < 0 || ref.weight > 1_000_000)) {
        issues.push({ path: `${refPath}.weight`, message: "Weight must be an integer from 0 to 1000000." });
      }
    });

    if (rule.backendRefs.length > 0 && rule.backendRefs.every((ref) => ref.weight === 0)) {
      issues.push({
        path: `${path}.backendRefs`,
        message: "Every backend has weight 0, so the rule answers with 500.",
      });
    }

    const { request, backendRequest } = rule.timeouts ?? {};

    if (request && !isValidDuration(request)) {
      issues.push({ path: `${path}.timeouts.request`, message: "Use a duration such as 10s, 1m or 500ms." });
    }

    if (backendRequest && !isValidDuration(backendRequest)) {
      issues.push({ path: `${path}.timeouts.backendRequest`, message: "Use a duration such as 10s, 1m or 500ms." });
    }

    if (
      request &&
      backendRequest &&
      isValidDuration(request) &&
      isValidDuration(backendRequest) &&
      durationToMs(request) !== 0 &&
      durationToMs(backendRequest) > durationToMs(request)
    ) {
      issues.push({
        path: `${path}.timeouts.backendRequest`,
        message: "The backend request timeout cannot be longer than the request timeout.",
      });
    }
  });

  return issues;
};

export const validateHostnames = (hostnames: readonly string[]): ValidationIssue[] =>
  hostnames.flatMap((hostname, index) =>
    isValidHostname(hostname)
      ? []
      : [{ path: `hostnames[${index}]`, message: `"${hostname}" is not a valid hostname.` }],
  );

/**
 * Checks of the parts of an object a YAML editor can get wrong without the
 * API server noticing before a controller does: names, versions and the
 * shapes the views read.
 */
export const validateGatewayApiObject = (object: unknown): ValidationIssue[] => {
  const value = object && typeof object === "object" ? (object as Record<string, unknown>) : {};
  const issues: ValidationIssue[] = [];
  const metadata = (value.metadata ?? {}) as Record<string, unknown>;

  if (typeof value.apiVersion !== "string" || !value.apiVersion.includes("/")) {
    issues.push({ path: "apiVersion", message: "apiVersion must be group/version." });
  }

  if (typeof value.kind !== "string" || !value.kind) {
    issues.push({ path: "kind", message: "kind is required." });
  }

  if (typeof metadata.name !== "string" || !dnsSubdomainPattern.test(metadata.name)) {
    issues.push({ path: "metadata.name", message: "metadata.name must be a lowercase DNS name." });
  }

  return issues;
};
