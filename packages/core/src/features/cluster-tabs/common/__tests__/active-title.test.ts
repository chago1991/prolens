/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import { activeTitleOf, clusterTabLabel } from "../active-title";

import type { TitledItem } from "../active-title";

const item = (title: unknown, active: boolean, children: TitledItem[] = []): TitledItem => ({
  title,
  isActive: { get: () => active },
  children,
});

describe("activeTitleOf", () => {
  it("names the deepest active item", () => {
    const items = [item("Cluster", false), item("Workloads", true, [item("Deployments", false), item("Pods", true)])];

    expect(activeTitleOf(items)).toBe("Pods");
  });

  it("falls back to the parent when no child is active", () => {
    expect(activeTitleOf([item("Workloads", true, [item("Pods", false)])])).toBe("Workloads");
  });

  it("skips titles that are not text", () => {
    expect(activeTitleOf([item({ jsx: true }, true)])).toBeUndefined();
  });

  it("is undefined when nothing is active", () => {
    expect(activeTitleOf([item("Pods", false)])).toBeUndefined();
  });
});

describe("clusterTabLabel", () => {
  it("puts the view in front of the cluster name", () => {
    expect(clusterTabLabel("Home-Cluster", "Pods")).toBe("Pods - Home-Cluster");
  });

  it("shows the cluster name alone without a view", () => {
    expect(clusterTabLabel("Home-Cluster", undefined)).toBe("Home-Cluster");
  });
});
