/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import { effectiveColumnOrder, isCustomColumnOrder, moveColumn } from "../column-order";

const defaults = ["name", "namespace", "containers", "restarts", "node"];

describe("effectiveColumnOrder", () => {
  it("is the default order without a saved one", () => {
    expect(effectiveColumnOrder(undefined, defaults)).toEqual(defaults);
  });

  it("keeps the saved order", () => {
    const saved = ["name", "namespace", "restarts", "containers", "node"];

    expect(effectiveColumnOrder(saved, defaults)).toEqual(saved);
  });

  it("drops columns that no longer exist and duplicates", () => {
    expect(
      effectiveColumnOrder(["gone", "node", "node", "name", "namespace", "containers", "restarts"], defaults),
    ).toEqual(["node", "name", "namespace", "containers", "restarts"]);
  });

  it("places a new column after the one that precedes it by default", () => {
    expect(effectiveColumnOrder(["node", "name", "namespace", "restarts"], defaults)).toEqual([
      "node",
      "name",
      "namespace",
      "containers",
      "restarts",
    ]);
  });

  it("puts a new first column first", () => {
    expect(effectiveColumnOrder(["namespace", "name"], ["name", "namespace"].concat([]))).toEqual([
      "namespace",
      "name",
    ]);
    expect(effectiveColumnOrder(["namespace"], ["name", "namespace"])).toEqual(["name", "namespace"]);
  });
});

describe("moveColumn", () => {
  it("moves a column after another", () => {
    expect(moveColumn(defaults, "containers", "restarts", "after")).toEqual([
      "name",
      "namespace",
      "restarts",
      "containers",
      "node",
    ]);
  });

  it("moves a column before another", () => {
    expect(moveColumn(defaults, "node", "name", "before")).toEqual([
      "node",
      "name",
      "namespace",
      "containers",
      "restarts",
    ]);
  });

  it("leaves the order alone for an unknown column or itself", () => {
    expect(moveColumn(defaults, "gone", "name", "before")).toEqual(defaults);
    expect(moveColumn(defaults, "name", "name", "after")).toEqual(defaults);
  });
});

describe("isCustomColumnOrder", () => {
  it("tells a moved order from the default", () => {
    expect(isCustomColumnOrder(defaults, defaults)).toBe(false);
    expect(isCustomColumnOrder(moveColumn(defaults, "node", "name", "before"), defaults)).toBe(true);
  });
});
