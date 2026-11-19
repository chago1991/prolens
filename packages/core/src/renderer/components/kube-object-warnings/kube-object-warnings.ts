/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Pod } from "@freelensapp/kube-object";

import type { KubeObject, PodContainerStatus } from "@freelensapp/kube-object";

import type { AiContainerSummary, AiPodSummary, AiWarning } from "../../../features/ai-tools/common/ask-ai-request";

export type KubeObjectWarning = AiWarning & {
  /** Stable within one object's list of warnings; used as a React key. */
  id: string;
};

/** The fields of a Kubernetes event this module reads. */
export interface WarningEventLike {
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  lastTimestamp?: string;
  eventTime?: string;
  firstTimestamp?: string;
  series?: { count?: number; lastObservedTime?: string };
  metadata?: { creationTimestamp?: string };
}

/** Waiting reasons of a container that is starting normally. */
const benignWaitingReasons = new Set(["ContainerCreating", "PodInitializing"]);

const timeOfEvent = (event: WarningEventLike) =>
  event.series?.lastObservedTime ??
  event.lastTimestamp ??
  event.eventTime ??
  event.firstTimestamp ??
  event.metadata?.creationTimestamp;

const epochOf = (timestamp: string | undefined) => {
  const time = timestamp ? Date.parse(timestamp) : Number.NaN;

  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

/**
 * The Warning events, newest first. Events with the same reason and message
 * are merged into one whose count is their sum.
 */
export const getWarningsFromEvents = (events: WarningEventLike[]): KubeObjectWarning[] => {
  const merged = new Map<string, KubeObjectWarning>();

  for (const event of events) {
    if (event.type !== "Warning") {
      continue;
    }

    const reason = event.reason || "Warning";
    const message = (event.message ?? "").trim();
    const key = `${reason}\u0000${message}`;
    const count = event.series?.count ?? event.count ?? 1;
    const timestamp = timeOfEvent(event);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { id: `event:${key}`, source: "event", reason, message, count, timestamp });
    } else {
      existing.count = (existing.count ?? 1) + count;

      if (epochOf(timestamp) > epochOf(existing.timestamp)) {
        existing.timestamp = timestamp;
      }
    }
  }

  return [...merged.values()].sort((left, right) => epochOf(right.timestamp) - epochOf(left.timestamp));
};

interface ConditionLike {
  type?: string;
  status?: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
  lastUpdateTime?: string;
}

/**
 * Conditions that mean a workload is failing. `Available` and `Progressing`
 * are bad when false, the others when true.
 */
const failingCondition = ({ type, status }: ConditionLike) =>
  ((type === "Available" || type === "Progressing") && status === "False") ||
  ((type === "ReplicaFailure" || type === "Failed") && status === "True");

const containerWarnings = (pod: Pod): KubeObjectWarning[] => {
  const warnings: KubeObjectWarning[] = [];

  for (const status of pod.getContainerStatuses()) {
    const { waiting, terminated } = status.state ?? {};
    const restarts = status.restartCount ? ` (restarted ${status.restartCount} times)` : "";

    if (waiting?.reason && !benignWaitingReasons.has(waiting.reason)) {
      warnings.push({
        id: `status:container:${status.name}:${waiting.reason}`,
        source: "status",
        reason: waiting.reason,
        message: `Container ${status.name}${restarts}: ${waiting.message || waiting.reason}`,
      });
    } else if (terminated && terminated.exitCode !== 0 && pod.getStatusPhase() !== "Succeeded") {
      const reason = terminated.reason || "Error";

      warnings.push({
        id: `status:container:${status.name}:${reason}`,
        source: "status",
        reason,
        message: `Container ${status.name} exited with code ${terminated.exitCode}${restarts}${terminated.message ? `: ${terminated.message}` : ""}`,
        timestamp: terminated.finishedAt,
      });
    }
  }

  return warnings;
};

/**
 * Problems an object's own status shows, without looking at events.
 */
export const getWarningsFromStatus = (object: KubeObject): KubeObjectWarning[] => {
  const warnings: KubeObjectWarning[] = [];

  if (object instanceof Pod) {
    const reason = object.getReason();

    if (object.getStatusPhase() === "Failed" && reason) {
      warnings.push({
        id: `status:pod:${reason}`,
        source: "status",
        reason,
        message: object.status?.message || `Pod failed: ${reason}`,
      });
    }

    for (const condition of object.getConditions()) {
      if (condition.type === "PodScheduled" && condition.status === "False") {
        warnings.push({
          id: "status:condition:PodScheduled",
          source: "status",
          reason: condition.reason || "Unschedulable",
          message: condition.message || "The pod cannot be scheduled.",
          timestamp: condition.lastTransitionTime,
        });
      }
    }

    warnings.push(...containerWarnings(object));

    return warnings;
  }

  const conditions = (object as { status?: { conditions?: ConditionLike[] } }).status?.conditions;

  for (const condition of Array.isArray(conditions) ? conditions : []) {
    if (failingCondition(condition)) {
      warnings.push({
        id: `status:condition:${condition.type}`,
        source: "status",
        reason: condition.reason || `${condition.type}=${condition.status}`,
        message: condition.message || `Condition ${condition.type} is ${condition.status}.`,
        timestamp: condition.lastTransitionTime ?? condition.lastUpdateTime,
      });
    }
  }

  return warnings;
};

/**
 * The warnings ProLens shows for an object: problems in its status first,
 * then its Warning events, newest first.
 *
 * A pod that has recovered keeps its old Warning events for an hour; they
 * are not shown, as they no longer describe the pod.
 */
export const getKubeObjectWarnings = (object: KubeObject, events: WarningEventLike[]): KubeObjectWarning[] => {
  if (object instanceof Pod && !object.hasIssues()) {
    return [];
  }

  return [...getWarningsFromStatus(object), ...getWarningsFromEvents(events)];
};

const stateOf = (status: PodContainerStatus | undefined): AiContainerSummary["state"] => {
  if (status?.state?.running) return "running";
  if (status?.state?.waiting) return "waiting";
  if (status?.state?.terminated) return "terminated";

  return "unknown";
};

/**
 * A pod's containers, in the order of the pod spec, for an AI prompt.
 */
export const summarizePod = (pod: Pod): AiPodSummary => {
  const statuses = pod.getContainerStatuses();
  const typeOf = { containers: "container", initContainers: "init", ephemeralContainers: "ephemeral" } as const;

  return {
    name: pod.getName(),
    namespace: pod.getNs(),
    phase: pod.getStatusPhase(),
    containers: pod.getAllContainersWithType().map((container): AiContainerSummary => {
      const status = statuses.find((candidate) => candidate.name === container.name);
      const waiting = status?.state?.waiting;
      const terminated = status?.state?.terminated;

      return {
        name: container.name,
        type: typeOf[container.type],
        state: stateOf(status),
        ready: Boolean(status?.ready),
        restartCount: status?.restartCount ?? 0,
        reason: waiting?.reason ?? terminated?.reason,
        message: waiting?.message ?? terminated?.message,
        exitCode: terminated?.exitCode,
        lastTerminationReason: status?.lastState?.terminated?.reason,
      };
    }),
  };
};

const troubleOf = (pod: AiPodSummary) =>
  pod.containers.reduce(
    (score, container) => score + (container.ready ? 0 : 1000) + container.restartCount,
    pod.phase === "Running" || pod.phase === "Succeeded" ? 0 : 1000,
  );

/**
 * At most `limit` pods, the most affected first.
 */
export const summarizePods = (pods: Pod[], limit = 5) =>
  pods
    .map(summarizePod)
    .sort((left, right) => troubleOf(right) - troubleOf(left))
    .slice(0, limit);
