/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import {
  getKubeObjectWarnings,
  getWarningsFromEvents,
  getWarningsFromStatus,
  summarizePod,
  summarizePods,
} from "../kube-object-warnings";
import { crashingPod, deploymentWithConditions, healthyPod, warningEvent } from "./fixtures";

describe("getWarningsFromEvents", () => {
  it("keeps Warning events only, newest first", () => {
    const warnings = getWarningsFromEvents([
      warningEvent("FailedMount", "volume not found", "2026-01-01T10:00:00Z"),
      { type: "Normal", reason: "Pulled", message: "pulled", lastTimestamp: "2026-01-01T11:00:00Z" },
      warningEvent("BackOff", "back-off restarting", "2026-01-01T10:30:00Z", 4),
    ]);

    expect(warnings.map(({ reason, count }) => [reason, count])).toEqual([
      ["BackOff", 4],
      ["FailedMount", 1],
    ]);
  });

  it("merges repeats of the same reason and message, summing their counts and keeping the latest time", () => {
    const [warning, ...rest] = getWarningsFromEvents([
      warningEvent("BackOff", "back-off", "2026-01-01T10:00:00Z", 2),
      warningEvent("BackOff", "back-off", "2026-01-01T10:05:00Z", 3),
    ]);

    expect(rest).toHaveLength(0);
    expect(warning).toMatchObject({ count: 5, timestamp: "2026-01-01T10:05:00Z", source: "event" });
  });

  it("uses the series of a new-style event", () => {
    const [warning] = getWarningsFromEvents([
      {
        type: "Warning",
        reason: "Unhealthy",
        message: "Readiness probe failed",
        eventTime: "2026-01-01T09:00:00Z",
        series: { count: 9, lastObservedTime: "2026-01-01T10:00:00Z" },
      },
    ]);

    expect(warning).toMatchObject({ count: 9, timestamp: "2026-01-01T10:00:00Z" });
  });
});

describe("getWarningsFromStatus", () => {
  it("reports a crash-looping container with its restarts", () => {
    expect(getWarningsFromStatus(crashingPod())).toEqual([
      expect.objectContaining({
        source: "status",
        reason: "CrashLoopBackOff",
        message: "Container web (restarted 12 times): back-off 5m0s restarting failed container",
      }),
    ]);
  });

  it("reports a container that exited with an error, but not one still being created", () => {
    const pod = crashingPod([
      {
        name: "migrate",
        ready: false,
        restartCount: 0,
        state: { terminated: { reason: "Error", exitCode: 2, startedAt: "", finishedAt: "2026-01-01T10:00:00Z" } },
      },
      { name: "new", ready: false, restartCount: 0, state: { waiting: { reason: "ContainerCreating", message: "" } } },
    ]);

    expect(getWarningsFromStatus(pod).map((warning) => warning.message)).toEqual([
      expect.stringContaining("Container web"),
      "Container migrate exited with code 2",
    ]);
  });

  it("reports the failing conditions of a workload", () => {
    const deployment = deploymentWithConditions([
      { type: "Available", status: "True" },
      { type: "Progressing", status: "False", reason: "ProgressDeadlineExceeded", message: "timed out" },
      { type: "ReplicaFailure", status: "True", reason: "FailedCreate", message: "quota exceeded" },
    ]);

    expect(getWarningsFromStatus(deployment).map(({ reason, message }) => [reason, message])).toEqual([
      ["ProgressDeadlineExceeded", "timed out"],
      ["FailedCreate", "quota exceeded"],
    ]);
  });
});

describe("getKubeObjectWarnings", () => {
  const events = [warningEvent("BackOff", "back-off", "2026-01-01T10:00:00Z")];

  it("puts the status problems before the events", () => {
    expect(getKubeObjectWarnings(crashingPod(), events).map((warning) => warning.source)).toEqual(["status", "event"]);
  });

  it("hides old events of a pod that has recovered", () => {
    expect(getKubeObjectWarnings(healthyPod(), events)).toEqual([]);
  });

  it("shows the events of a workload", () => {
    expect(getKubeObjectWarnings(deploymentWithConditions([]), events)).toHaveLength(1);
  });

  it("has unique ids", () => {
    const ids = getKubeObjectWarnings(crashingPod(), events).map((warning) => warning.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("summarizePod(s)", () => {
  it("lists containers in spec order with state, readiness, restarts and last termination", () => {
    expect(summarizePod(crashingPod()).containers).toEqual([
      {
        name: "web",
        type: "container",
        state: "waiting",
        ready: false,
        restartCount: 12,
        reason: "CrashLoopBackOff",
        message: "back-off 5m0s restarting failed container",
        exitCode: undefined,
        lastTerminationReason: "OOMKilled",
      },
      expect.objectContaining({ name: "proxy", state: "running", ready: true, restartCount: 0 }),
    ]);
  });

  it("puts the most affected pod first and keeps at most the limit", () => {
    const summaries = summarizePods([healthyPod(), crashingPod(), healthyPod()], 2);

    expect(summaries.map((pod) => pod.name)).toEqual(["web-1", "api-1"]);
  });
});
