/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import { containerStatusClassName } from "./container-status-class-name";

import type { ContainerWithType, PodContainerStatus } from "@freelensapp/kube-object";

const container = { name: "web", image: "web", type: "containers" } as ContainerWithType;
const status = (overrides: Partial<PodContainerStatus>): PodContainerStatus => ({
  name: "web",
  ready: false,
  restartCount: 0,
  image: "web",
  imageID: "",
  ...overrides,
});

describe("containerStatusClassName", () => {
  it.each([
    ["running and ready", status({ ready: true, state: { running: { startedAt: "" } } }), "running"],
    ["running, not ready", status({ state: { running: { startedAt: "" } } }), "waiting"],
    ["being created", status({ state: { waiting: { reason: "ContainerCreating", message: "" } } }), "waiting"],
    [
      "crash looping",
      status({ state: { waiting: { reason: "CrashLoopBackOff", message: "" } } }),
      "crash-loop-back-off",
    ],
    ["failing to pull its image", status({ state: { waiting: { reason: "ImagePullBackOff", message: "" } } }), "error"],
    [
      "exited with an error",
      status({ state: { terminated: { exitCode: 1, reason: "Error", startedAt: "", finishedAt: "" } } }),
      "error",
    ],
    [
      "completed",
      status({ state: { terminated: { exitCode: 0, reason: "Completed", startedAt: "", finishedAt: "" } } }),
      "terminated",
    ],
  ])("a container %s", (_, containerStatus, expected) => {
    expect(containerStatusClassName(container, containerStatus)).toBe(expected);
  });
});
