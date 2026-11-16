/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ClusterSnapshot, Coverage, ResourceEvent, ResourceObject } from "../types";

let uid = 0;

export const resetUids = () => {
  uid = 0;
};

export const object = (
  kind: string,
  apiVersion: string,
  name: string,
  {
    namespace = "shop",
    labels,
    annotations,
    owner,
    spec,
    status,
    extra,
  }: {
    namespace?: string | null;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    owner?: ResourceObject;
    spec?: unknown;
    status?: unknown;
    extra?: Record<string, unknown>;
  } = {},
): ResourceObject => ({
  kind,
  apiVersion,
  metadata: {
    name,
    namespace: namespace ?? undefined,
    uid: `uid-${++uid}`,
    selfLink: `/self/${kind}/${namespace ?? ""}/${name}`,
    labels,
    annotations,
    ownerReferences: owner
      ? [
          {
            apiVersion: owner.apiVersion,
            kind: owner.kind,
            name: owner.metadata.name,
            uid: owner.metadata.uid as string,
            controller: true,
          },
        ]
      : undefined,
  },
  spec,
  status,
  ...extra,
});

export const runningPod = {
  phase: "Running",
  conditions: [{ type: "Ready", status: "True" }],
  containerStatuses: [{ name: "app", ready: true, restartCount: 0 }],
};

export const template = (labels: Record<string, string>, spec: Record<string, unknown> = {}) => ({
  selector: { matchLabels: labels },
  template: { metadata: { labels }, spec: { containers: [{ name: "app" }], ...spec } },
});

/** A Deployment with one ReplicaSet and pods, as the controllers create them. */
export const deploymentWithPods = (
  name: string,
  {
    namespace = "shop",
    labels = { app: name },
    podSpec = {},
    pods = 2,
    podStatus = runningPod,
    node = "node-1",
  }: {
    namespace?: string;
    labels?: Record<string, string>;
    podSpec?: Record<string, unknown>;
    pods?: number;
    podStatus?: unknown;
    node?: string;
  } = {},
) => {
  const deployment = object("Deployment", "apps/v1", name, {
    namespace,
    labels,
    spec: { replicas: pods, ...template(labels, podSpec) },
    status: { availableReplicas: pods, conditions: [{ type: "Available", status: "True" }] },
  });
  const replicaSet = object("ReplicaSet", "apps/v1", `${name}-abc`, {
    namespace,
    labels,
    owner: deployment,
    spec: { replicas: pods, ...template(labels, podSpec) },
    status: { readyReplicas: pods },
  });
  const podObjects = Array.from({ length: pods }, (_, index) =>
    object("Pod", "v1", `${name}-abc-${index}`, {
      namespace,
      labels,
      owner: replicaSet,
      spec: { nodeName: node, containers: [{ name: "app" }], ...podSpec },
      status: podStatus,
    }),
  );

  return { deployment, replicaSet, pods: podObjects, all: [deployment, replicaSet, ...podObjects] };
};

export const everythingLoaded: Coverage = { isLoaded: () => true };

export const snapshot = (
  objects: ResourceObject[],
  { coverage = everythingLoaded, events = [] }: { coverage?: Coverage; events?: ResourceEvent[] } = {},
): ClusterSnapshot => ({
  objects,
  events,
  coverage,
});
