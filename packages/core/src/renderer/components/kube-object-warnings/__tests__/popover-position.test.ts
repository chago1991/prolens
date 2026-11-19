/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import { computePopoverPosition } from "../popover-position";

const viewport = { width: 1000, height: 800 };
const popover = { width: 380, height: 200 };
const anchorAt = (left: number, top: number) => ({ left, top, right: left + 24, bottom: top + 22 });

describe("computePopoverPosition", () => {
  it("opens below the anchor, aligned with it", () => {
    expect(computePopoverPosition(anchorAt(300, 100), popover, viewport)).toEqual({
      top: 128,
      left: 292,
      placement: "bottom",
      maxHeight: undefined,
    });
  });

  it("flips above the anchor near the bottom of the window", () => {
    const position = computePopoverPosition(anchorAt(300, 700), popover, viewport);

    expect(position.placement).toBe("top");
    expect(position.top).toBe(700 - 6 - 200);
  });

  it("stays inside the window near its right and left edges", () => {
    expect(computePopoverPosition(anchorAt(950, 100), popover, viewport).left).toBe(1000 - 380 - 8);
    expect(computePopoverPosition(anchorAt(2, 100), popover, viewport).left).toBe(8);
  });

  it("limits the height when neither side has room", () => {
    const position = computePopoverPosition(anchorAt(300, 300), { width: 380, height: 900 }, viewport);

    expect(position.placement).toBe("bottom");
    expect(position.maxHeight).toBe(800 - 322 - 6 - 8);
  });
});
