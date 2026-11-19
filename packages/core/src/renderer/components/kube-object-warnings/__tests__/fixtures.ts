/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Deployment, Pod } from "@freelensapp/kube-object";

import type { PodContainerStatus } from "@freelensapp/kube-object";

const metadata = (name: string) => ({
  name,
  namespace: "shop",
  uid: `uid-${name}`,
  resourceVersion: "1",
  selfLink: `/api/v1/namespaces/shop/pods/${name}`,
});

export const crashingPod = (statuses: Partial<PodContainerStatus>[] = []) =>
  new Pod({
    apiVersion: "v1",
    kind: "Pod",
    metadata: metadata("web-1"),
    spec: {
      containers: [
        { name: "web", image: "web:1" },
        { name: "proxy", image: "proxy:1" },
      ],
    },
    status: {
      phase: "Running",
      conditions: [{ type: "Ready", status: "False", lastProbeTime: 0, lastTransitionTime: "" }],
      containerStatuses: [
        {
          name: "web",
          ready: false,
          restartCount: 12,
          image: "web:1",
          imageID: "",
          state: { waiting: { reason: "CrashLoopBackOff", message: "back-off 5m0s restarting failed container" } },
          lastState: {
            terminated: { reason: "OOMKilled", exitCode: 137, startedAt: "", finishedAt: "" },
          },
        },
        {
          name: "proxy",
          ready: true,
          restartCount: 0,
          image: "proxy:1",
          imageID: "",
          state: { running: { startedAt: "2026-01-01T00:00:00Z" } },
        },
        ...(statuses as PodContainerStatus[]),
      ],
    },
  } as never);

export const healthyPod = () =>
  new Pod({
    apiVersion: "v1",
    kind: "Pod",
    metadata: metadata("api-1"),
    spec: { containers: [{ name: "api", image: "api:1" }] },
    status: {
      phase: "Running",
      conditions: [{ type: "Ready", status: "True", lastProbeTime: 0, lastTransitionTime: "" }],
      containerStatuses: [
        {
          name: "api",
          ready: true,
          restartCount: 0,
          image: "api:1",
          imageID: "",
          state: { running: { startedAt: "2026-01-01T00:00:00Z" } },
        },
      ],
    },
  } as never);

export const deploymentWithConditions = (
  conditions: { type: string; status: string; reason?: string; message?: string }[],
) =>
  new Deployment({
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { ...metadata("web"), selfLink: "/apis/apps/v1/namespaces/shop/deployments/web" },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: "web" } },
      template: { metadata: { labels: { app: "web" } } },
    },
    status: { conditions },
  } as never);

export const warningEvent = (reason: string, message: string, lastTimestamp: string, count = 1) => ({
  type: "Warning",
  reason,
  message,
  count,
  lastTimestamp,
});
