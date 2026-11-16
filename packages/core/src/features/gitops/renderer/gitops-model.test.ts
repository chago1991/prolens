/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import { patchFor } from "./gitops-actions.injectable";
import { canRollback, compareUrl, driftOf, parseInventoryId, toGitOpsApp } from "./gitops-model";

import type { GitOpsApp, GitOpsObject } from "./gitops-model";

const argoApp = (
  overrides: { spec?: Record<string, unknown>; status?: Record<string, unknown> } = {},
): GitOpsObject => ({
  kind: "Application",
  apiVersion: "argoproj.io/v1alpha1",
  metadata: {
    name: "shop",
    namespace: "argocd",
    selfLink: "/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/shop",
  },
  spec: {
    source: { repoURL: "https://github.com/acme/deploy.git", path: "apps/shop", targetRevision: "main" },
    destination: { server: "https://kubernetes.default.svc", namespace: "shop" },
    ...overrides.spec,
  },
  status: {
    sync: { status: "OutOfSync", revision: "b".repeat(40) },
    health: { status: "Degraded" },
    operationState: { phase: "Succeeded", finishedAt: "2026-11-16T09:00:00Z" },
    resources: [
      {
        group: "apps",
        kind: "Deployment",
        namespace: "shop",
        name: "web",
        status: "OutOfSync",
        health: { status: "Degraded", message: "rollout stuck" },
      },
      { group: "", kind: "Service", namespace: "shop", name: "web", status: "Synced", health: { status: "Healthy" } },
    ],
    history: [
      { id: 1, revision: "a".repeat(40), deployedAt: "2026-11-15T09:00:00Z" },
      { id: 2, revision: "b".repeat(40), deployedAt: "2026-11-16T09:00:00Z" },
    ],
    ...overrides.status,
  },
});

const kustomization = (conditions: unknown[], spec: Record<string, unknown> = {}): GitOpsObject => ({
  kind: "Kustomization",
  apiVersion: "kustomize.toolkit.fluxcd.io/v1",
  metadata: { name: "infra", namespace: "flux-system" },
  spec: { path: "./infra", sourceRef: { kind: "GitRepository", name: "fleet" }, ...spec },
  status: {
    conditions,
    lastAppliedRevision: "main@sha1:abc",
    inventory: {
      entries: [
        { id: "monitoring_prometheus_apps_Deployment" },
        { id: "_cluster-admin_rbac.authorization.k8s.io_ClusterRole" },
      ],
    },
  },
});

describe("toGitOpsApp", () => {
  it("reads an Argo CD Application: source, sync, health, resources and history newest first", () => {
    const app = toGitOpsApp(argoApp()) as GitOpsApp;

    expect(app).toMatchObject({
      tool: "Argo CD",
      source: "https://github.com/acme/deploy.git",
      path: "apps/shop",
      targetRevision: "main",
      destination: "https://kubernetes.default.svc / shop",
      sync: "OutOfSync",
      health: "Degraded",
      automated: false,
      lastSync: "2026-11-16T09:00:00Z",
    });
    expect(app.resources).toHaveLength(2);
    expect(app.history.map((entry) => entry.id)).toEqual(["2", "1"]);
    expect(driftOf(app)).toEqual({ outOfSync: [app.resources[0]], unhealthy: [app.resources[0]] });
  });

  it("reports a running or failed Argo CD operation", () => {
    expect(toGitOpsApp(argoApp({ status: { operationState: { phase: "Running" } } }))?.sync).toBe("Progressing");
    expect(
      toGitOpsApp(argoApp({ status: { operationState: { phase: "Failed", message: "hook failed" } } })),
    ).toMatchObject({
      sync: "Failed",
      message: "hook failed",
    });
  });

  it("reads a Flux Kustomization from its conditions and inventory", () => {
    const app = toGitOpsApp(
      kustomization([{ type: "Ready", status: "True", lastTransitionTime: "2026-11-16T08:00:00Z" }]),
    ) as GitOpsApp;

    expect(app).toMatchObject({
      tool: "Flux",
      sync: "Synced",
      health: "Healthy",
      source: "GitRepository flux-system/fleet",
      path: "./infra",
    });
    expect(app.resources).toEqual([
      { group: "apps", kind: "Deployment", namespace: "monitoring", name: "prometheus" },
      { group: "rbac.authorization.k8s.io", kind: "ClusterRole", namespace: undefined, name: "cluster-admin" },
    ]);
  });

  it("reports a failing, reconciling or suspended Flux object", () => {
    expect(
      toGitOpsApp(kustomization([{ type: "Ready", status: "False", message: "kustomize build failed" }])),
    ).toMatchObject({
      sync: "Failed",
      health: "Degraded",
      message: "kustomize build failed",
    });
    expect(toGitOpsApp(kustomization([{ type: "Reconciling", status: "True" }]))?.sync).toBe("Progressing");
    expect(toGitOpsApp(kustomization([], { suspend: true }))).toMatchObject({ sync: "Suspended", suspended: true });
  });

  it("ignores other kinds", () => {
    expect(
      toGitOpsApp({ kind: "Application", apiVersion: "app.k8s.io/v1beta1", metadata: { name: "x" } }),
    ).toBeUndefined();
  });
});

describe("parseInventoryId", () => {
  it("keeps underscores in names", () => {
    expect(parseInventoryId("ns_my_name_apps_Deployment")).toEqual({
      namespace: "ns",
      name: "my_name",
      group: "apps",
      kind: "Deployment",
    });
    expect(parseInventoryId("bad")).toBeUndefined();
  });
});

describe("actions", () => {
  const now = new Date("2026-11-16T10:00:00Z");

  it("syncs an Argo CD app with an operation, to its target revision", () => {
    const app = toGitOpsApp(argoApp()) as GitOpsApp;

    expect(patchFor(app, { type: "sync", prune: true }, now)).toEqual({
      operation: { initiatedBy: { username: "prolens" }, info: undefined, sync: { revision: "main", prune: true } },
    });
    expect(patchFor(app, { type: "refresh" }, now)).toEqual({
      metadata: { annotations: { "argocd.argoproj.io/refresh": "normal" } },
    });
  });

  it("rolls an Argo CD app back by syncing an earlier revision, only without automated sync", () => {
    const app = toGitOpsApp(argoApp()) as GitOpsApp;

    expect(canRollback(app)).toBe(true);
    expect(patchFor(app, { type: "rollback", revision: "a".repeat(40), historyId: "1" }, now)).toMatchObject({
      operation: { sync: { revision: "a".repeat(40) } },
    });
    expect(canRollback(toGitOpsApp(argoApp({ spec: { syncPolicy: { automated: {} } } })) as GitOpsApp)).toBe(false);
  });

  it("reconciles, suspends and resumes Flux objects as the flux CLI does", () => {
    const app = toGitOpsApp(kustomization([])) as GitOpsApp;

    expect(patchFor(app, { type: "sync" }, now)).toEqual({
      metadata: { annotations: { "reconcile.fluxcd.io/requestedAt": "2026-11-16T10:00:00.000Z" } },
    });
    expect(patchFor(app, { type: "suspend" }, now)).toEqual({ spec: { suspend: true } });
    expect(patchFor(app, { type: "resume" }, now)).toEqual({ spec: { suspend: false } });
    expect(canRollback(app)).toBe(false);
  });
});

describe("compareUrl", () => {
  const a = "a".repeat(40);
  const b = "b".repeat(40);

  it("links GitHub and GitLab comparisons of commits", () => {
    expect(compareUrl("https://github.com/acme/deploy.git", a, b)).toBe(
      `https://github.com/acme/deploy/compare/${a}...${b}`,
    );
    expect(compareUrl("git@gitlab.com:acme/deploy.git", a, b)).toBe(
      `https://gitlab.com/acme/deploy/-/compare/${a}...${b}`,
    );
  });

  it("gives nothing for branch names or unknown hosts", () => {
    expect(compareUrl("https://github.com/acme/deploy", "main", b)).toBeUndefined();
    expect(compareUrl("https://git.internal/acme/deploy", a, b)).toBeUndefined();
  });
});
