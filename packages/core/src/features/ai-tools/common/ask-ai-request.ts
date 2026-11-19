/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * A reference to a Kubernetes object that survives IPC (no class instances).
 */
export interface AiResourceRef {
  kind: string;
  apiVersion: string;
  name: string;
  namespace?: string;
  uid?: string;
}

/** A warning ProLens shows for an object: a Warning event or a problem in its status. */
export interface AiWarning {
  source: "event" | "status";
  reason: string;
  message: string;
  /** How often the event was seen; events only. */
  count?: number;
  /** ISO time it was last seen, when known. */
  timestamp?: string;
}

export interface AiContainerSummary {
  name: string;
  type: "container" | "init" | "ephemeral";
  state: "running" | "waiting" | "terminated" | "unknown";
  ready: boolean;
  restartCount: number;
  reason?: string;
  message?: string;
  exitCode?: number;
  /** Reason of the previous run's termination, e.g. OOMKilled. */
  lastTerminationReason?: string;
}

export interface AiPodSummary {
  name: string;
  namespace?: string;
  phase?: string;
  containers: AiContainerSummary[];
}

/**
 * What ProLens already knows about an object's problems when the user asks
 * from a warning: the warnings, and the container states of the object's pods.
 */
export interface AiDiagnostics {
  warnings: AiWarning[];
  /** The pod itself, or the pods of a workload; the most affected first. */
  pods: AiPodSummary[];
}

export type AskAiTarget =
  | { type: "cluster" }
  /** `manifest` is the object as the cluster frame has it, when it has it. */
  | {
      type: "resource";
      resource: AiResourceRef;
      manifest?: Record<string, unknown>;
      diagnostics?: AiDiagnostics;
    }
  | { type: "events"; namespace?: string }
  | { type: "logs"; pod: AiResourceRef; container?: string; logs?: string }
  | { type: "yaml"; resource: AiResourceRef; yaml: string };

export interface AskAiRequest {
  target: AskAiTarget;
  /** A preset to preselect in the dialog. */
  presetId?: string;
}

export interface AskAiPreset {
  id: string;
  label: string;
  question: (target: AskAiTarget) => string;
  appliesTo: (target: AskAiTarget) => boolean;
}

const kindOf = (target: AskAiTarget) => {
  switch (target.type) {
    case "resource":
    case "yaml":
      return target.resource.kind;
    case "logs":
      return "Pod";
    default:
      return undefined;
  }
};

const isKind =
  (...kinds: string[]) =>
  (target: AskAiTarget) => {
    const kind = kindOf(target);

    return kind !== undefined && kinds.includes(kind);
  };

const workloadKinds = ["Pod", "Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"];

export const describeTarget = (target: AskAiTarget) => {
  switch (target.type) {
    case "cluster":
      return "this cluster";
    case "events":
      return target.namespace ? `the events in namespace ${target.namespace}` : "the cluster events";
    case "logs":
      return `the logs of pod ${target.pod.namespace}/${target.pod.name}${target.container ? ` (container ${target.container})` : ""}`;
    case "resource":
    case "yaml": {
      const { kind, namespace, name } = target.resource;

      return `${kind} ${namespace ? `${namespace}/` : ""}${name}`;
    }
  }
};

export const diagnosticsOf = (target: AskAiTarget) => (target.type === "resource" ? target.diagnostics : undefined);

export const hasWarnings = (target: AskAiTarget) => Boolean(diagnosticsOf(target)?.warnings.length);

export const askAiPresets: AskAiPreset[] = [
  {
    id: "explain-warning",
    label: "Explain this warning",
    question: (target) => {
      const reasons = [...new Set(diagnosticsOf(target)?.warnings.map((warning) => warning.reason) ?? [])].slice(0, 3);

      return [
        `ProLens shows ${reasons.length > 1 ? "warnings" : "a warning"} on ${describeTarget(target)}${reasons.length ? ` (${reasons.join(", ")})` : ""}.`,
        "Explain what the warnings in the context below mean, identify the most likely root cause, and suggest how to fix it.",
        "Give the read-only kubectl commands that confirm the diagnosis and, separately, the commands or manifest changes that would fix it.",
        "Do not run any command that changes the cluster without my explicit approval.",
      ].join(" ");
    },
    appliesTo: hasWarnings,
  },
  {
    id: "pod-crash",
    label: "Why is this pod crashing?",
    question: (target) =>
      `Why is ${describeTarget(target)} crashing or restarting? Find the root cause and suggest a fix.`,
    appliesTo: isKind("Pod"),
  },
  {
    id: "explain-config",
    label: "Explain this configuration",
    question: (target) =>
      `Explain the configuration of ${describeTarget(target)}: what it does, notable settings, and configuration or security risks.`,
    appliesTo: (target) => target.type === "resource" || target.type === "yaml",
  },
  {
    id: "scheduling",
    label: "Diagnose scheduling failures",
    question: (target) =>
      `Diagnose scheduling problems for ${describeTarget(target)}: pending pods, taints and tolerations, affinity, resource pressure and quotas.`,
    appliesTo: (target) => target.type === "cluster" || isKind(...workloadKinds, "Node")(target),
  },
  {
    id: "analyze-events",
    label: "Analyze Kubernetes events",
    question: (target) =>
      `Analyze the Kubernetes events for ${describeTarget(target)}. Group related events, explain warnings, and point out what needs attention.`,
    appliesTo: (target) => target.type !== "logs" && target.type !== "yaml",
  },
  {
    id: "resource-limits",
    label: "Explain resource limits",
    question: (target) =>
      `Explain the CPU and memory requests and limits of ${describeTarget(target)}, their QoS impact, and whether they look appropriate.`,
    appliesTo: isKind(...workloadKinds),
  },
  {
    id: "network",
    label: "Troubleshoot network connectivity",
    question: (target) =>
      `Help troubleshoot network connectivity for ${describeTarget(target)}: services, endpoints, DNS, network policies and ingress.`,
    appliesTo: (target) =>
      target.type === "cluster" ||
      isKind("Pod", "Service", "Ingress", "NetworkPolicy", "Deployment", "Endpoints")(target),
  },
  {
    id: "node-health",
    label: "Diagnose node health",
    question: (target) =>
      `Diagnose the health of ${describeTarget(target)}: conditions, pressure, capacity versus allocations, and kubelet issues.`,
    appliesTo: isKind("Node"),
  },
  {
    id: "analyze-logs",
    label: "Analyze these logs",
    question: (target) =>
      `Analyze ${describeTarget(target)}. Identify errors, their likely cause, and next diagnostic steps.`,
    appliesTo: (target) => target.type === "logs",
  },
  {
    id: "cluster-health",
    label: "Assess cluster health",
    question: () =>
      "Assess the overall health of this cluster: node status, failing workloads, warning events, and capacity.",
    appliesTo: (target) => target.type === "cluster",
  },
];

export const presetsFor = (target: AskAiTarget) => askAiPresets.filter((preset) => preset.appliesTo(target));

export const defaultPresetFor = (target: AskAiTarget, presetId?: string) => {
  const presets = presetsFor(target);

  return presets.find((preset) => preset.id === presetId) ?? presets[0];
};

/**
 * Instructions every prompt starts with. They keep the assistant on
 * read-only diagnostics unless the user approves a change.
 */
export const aiSafetyInstructions = [
  "You are assisting with Kubernetes diagnostics from ProLens.",
  "Work read-only: use only read commands such as `kubectl get`, `kubectl describe`, `kubectl logs`, `kubectl top` and `kubectl events`.",
  "Do NOT run commands that change the cluster (apply, create, delete, edit, patch, replace, scale, rollout restart/undo, drain, cordon, taint, label, annotate, exec, helm install/upgrade/uninstall) unless the user explicitly approves that exact command first.",
  "When a change would help, show the exact command or manifest and explain its impact and risk instead of running it.",
  "Some values in the context below were redacted by ProLens; never ask for or try to reveal them.",
].join("\n");

export interface AiPromptSection {
  title: string;
  body: string;
  /** Fence language, e.g. "yaml" or "text". */
  language?: string;
}

export interface AiPromptInput {
  question: string;
  clusterName?: string;
  contextName?: string;
  target: AskAiTarget;
  sections: AiPromptSection[];
}

const ageOf = (timestamp: string | undefined, now: number) => {
  const time = timestamp ? Date.parse(timestamp) : Number.NaN;

  if (Number.isNaN(time)) {
    return undefined;
  }

  const seconds = Math.max(0, Math.round((now - time) / 1000));

  if (seconds < 120) return `${seconds}s ago`;
  if (seconds < 7200) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`;

  return `${Math.round(seconds / 86400)}d ago`;
};

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The warnings and container states of `AiDiagnostics` as prompt text.
 */
export const formatDiagnostics = ({ warnings, pods }: AiDiagnostics, now = Date.now()) => {
  const lines: string[] = [];

  if (warnings.length) {
    lines.push("Warnings:");

    for (const warning of warnings) {
      const details = [
        warning.source === "event" ? "event" : "status",
        warning.count && warning.count > 1 ? `x${warning.count}` : undefined,
        ageOf(warning.timestamp, now),
      ].filter(Boolean);

      lines.push(`- ${warning.reason} (${details.join(", ")}): ${oneLine(warning.message)}`);
    }
  }

  for (const pod of pods) {
    lines.push(
      "",
      `Pod ${pod.namespace ? `${pod.namespace}/` : ""}${pod.name}${pod.phase ? ` (phase ${pod.phase})` : ""}:`,
    );

    if (!pod.containers.length) {
      lines.push("- no container statuses reported yet");
    }

    for (const container of pod.containers) {
      const details = [
        container.type === "container" ? undefined : container.type,
        container.state,
        container.reason,
        container.exitCode !== undefined ? `exit code ${container.exitCode}` : undefined,
        container.ready ? "ready" : "not ready",
        `restarts ${container.restartCount}`,
        container.lastTerminationReason ? `last termination ${container.lastTerminationReason}` : undefined,
      ].filter(Boolean);

      lines.push(
        `- ${container.name}: ${details.join(", ")}${container.message ? ` — ${oneLine(container.message)}` : ""}`,
      );
    }
  }

  return lines.join("\n").trim();
};

export const maxSectionLength = 12_000;

export const truncate = (text: string, limit = maxSectionLength) =>
  text.length > limit
    ? `${text.slice(0, limit)}\n… [truncated by ProLens: ${text.length - limit} more characters]`
    : text;

const fence = (body: string, language = "text") => {
  const longestRun = Math.max(2, ...Array.from(body.matchAll(/`+/g), ([run]) => run.length));
  const marker = "`".repeat(longestRun + 1);

  return `${marker}${language}\n${body}\n${marker}`;
};

export const buildAiPrompt = ({ question, clusterName, contextName, target, sections }: AiPromptInput) => {
  const lines = [aiSafetyInstructions, "", "## Question", question.trim(), "", "## Context"];

  if (clusterName) {
    lines.push(`- Cluster: ${clusterName}`);
  }

  if (contextName && contextName !== clusterName) {
    lines.push(`- kubeconfig context: ${contextName}`);
  }

  if (target.type === "resource" || target.type === "yaml") {
    const { kind, apiVersion, name, namespace } = target.resource;

    lines.push(`- Resource: ${kind} (${apiVersion}) ${name}`);

    if (namespace) {
      lines.push(`- Namespace: ${namespace}`);
    }
  } else if (target.type === "logs") {
    lines.push(`- Pod: ${target.pod.name}`, `- Namespace: ${target.pod.namespace ?? "default"}`);

    if (target.container) {
      lines.push(`- Container: ${target.container}`);
    }
  } else if (target.type === "events" && target.namespace) {
    lines.push(`- Namespace: ${target.namespace}`);
  }

  lines.push("- The terminal this runs in is already configured for this cluster; kubectl uses that context.");

  for (const section of sections) {
    if (!section.body.trim()) {
      continue;
    }

    lines.push("", `### ${section.title}`, fence(redactSensitiveText(truncate(section.body)), section.language));
  }

  return lines.join("\n");
};

const redacted = "<redacted>";

const sensitiveTextPatterns: [RegExp, string | ((match: string, ...groups: string[]) => string)][] = [
  [
    /-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----/g,
    redacted,
  ],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, redacted],
  [/\b(bearer|basic)\s+[A-Za-z0-9\-._~+/]{12,}=*/gi, (_match, scheme) => `${scheme} ${redacted}`],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, redacted],
  [
    /\b(gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,})\b/g,
    redacted,
  ],
  [
    /((?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)["']?\s*[:=]\s*)(["']?)[^\s"',}]{4,}\2/gi,
    (_match, prefix, quote) => `${prefix}${quote}${redacted}${quote}`,
  ],
];

/**
 * Redacts credentials that commonly appear in logs, events and manifests.
 * A best-effort pass on top of structural redaction, not a guarantee.
 */
export const redactSensitiveText = (text: string) =>
  sensitiveTextPatterns.reduce(
    (result, [pattern, replacement]) =>
      result.replace(pattern, replacement as (substring: string, ...args: string[]) => string),
    text,
  );
