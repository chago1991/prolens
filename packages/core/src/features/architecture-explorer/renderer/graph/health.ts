/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Health, ResourceObject } from "./types";

export interface HealthAssessment {
  health: Health;
  reasons: string[];
  status?: string;
}

interface Condition {
  type?: string;
  status?: string;
  reason?: string;
  message?: string;
}

interface ContainerStatus {
  name?: string;
  ready?: boolean;
  restartCount?: number;
  state?: {
    waiting?: { reason?: string; message?: string };
    terminated?: { reason?: string; exitCode?: number; message?: string };
  };
  lastState?: { terminated?: { reason?: string; exitCode?: number } };
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const num = (value: unknown): number => (typeof value === "number" ? value : 0);

const conditionsOf = (value: unknown): Condition[] => (Array.isArray(value) ? (value as Condition[]) : []);

const severity: Record<Health, number> = { healthy: 0, unknown: 1, warning: 2, critical: 3, missing: 4 };

/** The worse of two health values; `missing` counts as worst. */
export const worse = (a: Health, b: Health): Health => (severity[a] >= severity[b] ? a : b);

export const healthRank = (health: Health): number => severity[health];

export const isProblem = (health: Health): boolean =>
  health === "warning" || health === "critical" || health === "missing";

/** Waiting and termination reasons that keep a container from running. */
const criticalContainerReasons = new Set([
  "CrashLoopBackOff",
  "ImagePullBackOff",
  "ErrImagePull",
  "InvalidImageName",
  "CreateContainerConfigError",
  "CreateContainerError",
  "RunContainerError",
  "ContainerCannotRun",
  "OOMKilled",
  "Error",
]);

const assessPod = (pod: ResourceObject): HealthAssessment => {
  const status = record(pod.status);
  const phase = typeof status.phase === "string" ? status.phase : "Unknown";
  const reasons: string[] = [];
  let health: Health = "healthy";

  if (pod.metadata.deletionTimestamp) {
    return { health: "healthy", reasons: ["Terminating"], status: "Terminating" };
  }

  if (phase === "Succeeded") {
    return { health: "healthy", reasons: [], status: "Completed" };
  }

  if (phase === "Failed") {
    const reason = typeof status.reason === "string" ? status.reason : "Failed";
    const message = typeof status.message === "string" ? `: ${status.message}` : "";

    // An evicted pod is a leftover the controller already replaced.
    return {
      health: reason === "Evicted" ? "warning" : "critical",
      reasons: [`Pod ${reason}${message}`],
      status: reason,
    };
  }

  const conditions = conditionsOf(status.conditions);
  const scheduled = conditions.find((c) => c.type === "PodScheduled");

  if (scheduled?.status === "False") {
    reasons.push(`Not scheduled (${scheduled.reason ?? "Unschedulable"}): ${scheduled.message ?? "no message"}`);
    health = "critical";
  }

  const containers = [
    ...(Array.isArray(status.initContainerStatuses) ? (status.initContainerStatuses as ContainerStatus[]) : []),
    ...(Array.isArray(status.containerStatuses) ? (status.containerStatuses as ContainerStatus[]) : []),
  ];

  for (const container of containers) {
    const waiting = container.state?.waiting;
    const terminated = container.state?.terminated;
    const last = container.lastState?.terminated;

    if (waiting?.reason && waiting.reason !== "PodInitializing" && waiting.reason !== "ContainerCreating") {
      const lastExit = last ? ` (last exit: ${last.reason ?? "unknown"}, code ${last.exitCode ?? "?"})` : "";

      reasons.push(
        `Container ${container.name ?? "?"} ${waiting.reason}${waiting.message ? `: ${waiting.message}` : ""}${lastExit}`,
      );
      health = worse(health, criticalContainerReasons.has(waiting.reason) ? "critical" : "warning");
    } else if (terminated && terminated.reason !== "Completed" && (terminated.exitCode ?? 0) !== 0) {
      reasons.push(
        `Container ${container.name ?? "?"} terminated: ${terminated.reason ?? "Error"}, exit code ${terminated.exitCode}`,
      );
      health = worse(health, "critical");
    }

    if (num(container.restartCount) > 0 && last?.reason === "OOMKilled") {
      reasons.push(`Container ${container.name ?? "?"} was OOMKilled (${container.restartCount} restarts)`);
      health = worse(health, "warning");
    }
  }

  const ready = conditions.find((c) => c.type === "Ready");

  if (phase === "Running" && ready?.status === "False" && health === "healthy") {
    reasons.push(`Not ready${ready.message ? `: ${ready.message}` : ""}`);
    health = "warning";
  }

  if (phase === "Pending" && health === "healthy") {
    reasons.push("Pending");
    health = "warning";
  }

  const restarts = containers.reduce((sum, c) => sum + num(c.restartCount), 0);
  const readyCount = containers.filter((c) => c.ready).length;

  return {
    health,
    reasons,
    status: `${phase}${containers.length ? `, ${readyCount}/${containers.length} ready` : ""}${restarts ? `, ${restarts} restarts` : ""}`,
  };
};

const replicas = (desired: number, ready: number, noun = "ready", extra: string[] = []): HealthAssessment => {
  const reasons = [...extra];
  let health: Health = "healthy";

  if (desired > 0 && ready === 0) {
    reasons.unshift(`No replica ${noun} (0/${desired})`);
    health = "critical";
  } else if (ready < desired) {
    reasons.unshift(`${ready}/${desired} replicas ${noun}`);
    health = "warning";
  }

  if (extra.length && health === "healthy") {
    health = "warning";
  }

  return { health, reasons, status: `${ready}/${desired} ${noun}` };
};

const failingConditions = (conditions: Condition[], expectTrue: string[], expectFalse: string[] = []) =>
  conditions
    .filter(
      (c) =>
        (expectTrue.includes(c.type ?? "") && c.status === "False") ||
        (expectFalse.includes(c.type ?? "") && c.status === "True"),
    )
    .map((c) => `${c.type} is ${c.status}${c.reason ? ` (${c.reason})` : ""}${c.message ? `: ${c.message}` : ""}`);

const assessNode = (node: ResourceObject): HealthAssessment => {
  const status = record(node.status);
  const spec = record(node.spec);
  const conditions = conditionsOf(status.conditions);
  const ready = conditions.find((c) => c.type === "Ready");
  const reasons: string[] = [];
  let health: Health = "healthy";

  if (!ready || ready.status !== "True") {
    reasons.push(`Ready is ${ready?.status ?? "Unknown"}${ready?.message ? `: ${ready.message}` : ""}`);
    health = "critical";
  }

  const pressure = failingConditions(
    conditions,
    [],
    ["MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"],
  );

  if (pressure.length) {
    reasons.push(...pressure);
    health = worse(health, "warning");
  }

  if (spec.unschedulable === true) {
    reasons.push("Cordoned: new pods are not scheduled here");
    health = worse(health, "warning");
  }

  return { health, reasons, status: ready?.status === "True" ? "Ready" : "NotReady" };
};

const assessWorkload = (object: ResourceObject): HealthAssessment => {
  const spec = record(object.spec);
  const status = record(object.status);
  const conditions = conditionsOf(status.conditions);

  switch (object.kind) {
    case "Deployment": {
      const desired = typeof spec.replicas === "number" ? spec.replicas : 1;
      const failed = failingConditions(conditions, ["Available", "Progressing"], ["ReplicaFailure"]);
      const assessment = replicas(desired, num(status.availableReplicas), "available", failed);

      if (failed.some((reason) => reason.startsWith("Progressing") || reason.startsWith("ReplicaFailure"))) {
        assessment.health = "critical";
      }

      return assessment;
    }
    case "StatefulSet":
      return replicas(typeof spec.replicas === "number" ? spec.replicas : 1, num(status.readyReplicas));
    case "ReplicaSet":
    case "ReplicationController":
      return replicas(
        typeof spec.replicas === "number" ? spec.replicas : 1,
        num(status.readyReplicas),
        "ready",
        failingConditions(conditions, [], ["ReplicaFailure"]),
      );
    case "DaemonSet": {
      const desired = num(status.desiredNumberScheduled);
      const misscheduled = num(status.numberMisscheduled);

      return replicas(
        desired,
        num(status.numberReady),
        "ready",
        misscheduled ? [`${misscheduled} pods on nodes they should not run on`] : [],
      );
    }
    case "Job": {
      const failed = conditions.find((c) => c.type === "Failed" && c.status === "True");

      if (failed) {
        return {
          health: "critical",
          reasons: [
            `Failed${failed.reason ? ` (${failed.reason})` : ""}${failed.message ? `: ${failed.message}` : ""}`,
          ],
          status: "Failed",
        };
      }

      const complete = conditions.some((c) => c.type === "Complete" && c.status === "True");

      return {
        health: "healthy",
        reasons: [],
        status: complete ? "Complete" : `${num(status.active)} active`,
      };
    }
    case "CronJob":
      return { health: "healthy", reasons: [], status: spec.suspend === true ? "Suspended" : "Scheduled" };
    default:
      return { health: "unknown", reasons: [] };
  }
};

const assessGatewayApi = (object: ResourceObject): HealthAssessment => {
  const status = record(object.status);

  if (object.kind === "Gateway" || object.kind === "GatewayClass") {
    const failed = failingConditions(conditionsOf(status.conditions), ["Accepted", "Programmed"]);

    return {
      health: failed.length ? "critical" : status.conditions ? "healthy" : "unknown",
      reasons: failed,
      status: failed.length ? "Not programmed" : status.conditions ? "Programmed" : undefined,
    };
  }

  // Routes report per parent gateway.
  const parents = Array.isArray(status.parents) ? (status.parents as { conditions?: Condition[] }[]) : [];
  const failed = parents.flatMap((parent) =>
    failingConditions(conditionsOf(parent.conditions), ["Accepted", "ResolvedRefs"]),
  );

  return {
    health: failed.length ? "critical" : parents.length ? "healthy" : "unknown",
    reasons: failed,
    status: parents.length ? `${parents.length} parent${parents.length === 1 ? "" : "s"}` : "No status",
  };
};

/** The health of an object from its own status, without its neighbours. */
export const assessHealth = (object: ResourceObject): HealthAssessment => {
  const status = record(object.status);
  const spec = record(object.spec);

  switch (object.kind) {
    case "Pod":
      return assessPod(object);
    case "Node":
      return assessNode(object);
    case "Deployment":
    case "StatefulSet":
    case "ReplicaSet":
    case "ReplicationController":
    case "DaemonSet":
    case "Job":
    case "CronJob":
      return assessWorkload(object);
    case "PersistentVolumeClaim": {
      const phase = typeof status.phase === "string" ? status.phase : "Unknown";

      if (phase === "Bound") return { health: "healthy", reasons: [], status: phase };
      if (phase === "Lost") return { health: "critical", reasons: ["Claim lost its volume"], status: phase };

      return { health: "warning", reasons: [`Claim is ${phase}`], status: phase };
    }
    case "PersistentVolume": {
      const phase = typeof status.phase === "string" ? status.phase : "Unknown";

      if (phase === "Failed") {
        return {
          health: "critical",
          reasons: [`Volume failed${status.message ? `: ${status.message}` : ""}`],
          status: phase,
        };
      }

      if (phase === "Released") {
        return {
          health: "warning",
          reasons: ["Released: the claim was deleted, the volume is not reusable as is"],
          status: phase,
        };
      }

      return { health: "healthy", reasons: [], status: phase };
    }
    case "Namespace":
      return status.phase === "Terminating"
        ? { health: "warning", reasons: ["Namespace is terminating"], status: "Terminating" }
        : { health: "healthy", reasons: [], status: "Active" };
    case "Service":
      return { health: "healthy", reasons: [], status: typeof spec.type === "string" ? spec.type : "ClusterIP" };
    case "Gateway":
    case "GatewayClass":
    case "HTTPRoute":
    case "GRPCRoute":
    case "TLSRoute":
    case "TCPRoute":
    case "UDPRoute":
      return assessGatewayApi(object);
    default:
      return { health: "healthy", reasons: [] };
  }
};
