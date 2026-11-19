/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import callForLogsInjectable from "../../../../renderer/components/dock/logs/call-for-logs.injectable";
import { diagnosticsOf, hasWarnings } from "../../common/ask-ai-request";
import { aiContextSourceInjectionToken } from "../context-source";

import type { AskAiTarget } from "../../common/ask-ai-request";

const tailLines = 200;
const maxContainers = 3;

const containerNamesOf = (manifest: Record<string, unknown> | undefined) => {
  const spec = manifest?.spec as { containers?: { name?: string }[] } | undefined;

  return (spec?.containers ?? []).map((container) => container.name).filter((name): name is string => Boolean(name));
};

/**
 * The pod whose logs a resource target gets: the pod itself, or the most
 * affected pod of a workload asked about from a warning. Containers with a
 * problem come first.
 */
const podForLogs = (target: AskAiTarget) => {
  if (target.type !== "resource") {
    return undefined;
  }

  const summary = diagnosticsOf(target)?.pods[0];

  if (target.resource.kind === "Pod") {
    const { name, namespace = "default" } = target.resource;
    const fromManifest = containerNamesOf(target.manifest);
    const troubled = summary?.containers
      .filter((container) => container.type !== "ephemeral" && (!container.ready || container.restartCount > 0))
      .map((container) => container.name);
    const containers = troubled?.length
      ? [...troubled, ...fromManifest.filter((container) => !troubled.includes(container))]
      : fromManifest;

    return { name, namespace, containers };
  }

  if (!summary) {
    return undefined;
  }

  const containers = summary.containers
    .filter((container) => container.type !== "ephemeral")
    .sort((left, right) => Number(left.ready) - Number(right.ready) || right.restartCount - left.restartCount)
    .map((container) => container.name);

  return { name: summary.name, namespace: summary.namespace ?? target.resource.namespace ?? "default", containers };
};

const logsAiContextSourceInjectable = getInjectable({
  id: "logs-ai-context-source",
  instantiate: (di) => ({
    id: "logs",
    label: "Pod logs",
    description: `The last ${tailLines} lines per container (up to ${maxContainers} containers), including the previous run's when it crashed.`,
    orderNumber: 30,
    isAvailableFor: (target) => target.type === "logs" || podForLogs(target) !== undefined,
    // Asked from a warning, recent logs usually hold the cause; the user can still untick them.
    isEnabledByDefaultFor: (target) => target.type === "logs" || hasWarnings(target),
    collect: async (target, signal) => {
      const callForLogs = di.inject(callForLogsInjectable);

      if (target.type === "logs") {
        const logs =
          target.logs ??
          (await callForLogs(
            { name: target.pod.name, namespace: target.pod.namespace ?? "default" },
            { container: target.container, tailLines },
            signal,
          ));

        return {
          title: `Logs${target.container ? ` of container ${target.container}` : ""}`,
          body: logs || "(no output)",
        };
      }

      const pod = podForLogs(target);

      if (!pod) {
        return undefined;
      }

      const { name, namespace } = pod;
      const containers = pod.containers.slice(0, maxContainers);
      const parts: string[] = [];

      for (const container of containers.length ? containers : [undefined]) {
        const heading = container ? `--- container ${container} ---` : "--- logs ---";

        try {
          parts.push(
            heading,
            (await callForLogs({ name, namespace }, { container, tailLines }, signal)) || "(no output)",
          );
        } catch (error) {
          parts.push(heading, `(could not read logs: ${String(error)})`);
        }

        try {
          const previous = await callForLogs({ name, namespace }, { container, tailLines: 50, previous: true }, signal);

          if (previous.trim()) {
            parts.push(`--- previous run${container ? ` of ${container}` : ""} ---`, previous);
          }
        } catch {
          // No previous run: the container never restarted.
        }
      }

      return {
        title: target.type === "resource" && target.resource.kind !== "Pod" ? `Logs of pod ${name}` : "Pod logs",
        body: parts.join("\n"),
      };
    },
  }),
  injectionToken: aiContextSourceInjectionToken,
});

export default logsAiContextSourceInjectable;
