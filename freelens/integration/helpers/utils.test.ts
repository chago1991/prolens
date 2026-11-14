/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { basename } from "node:path";
import { describe, expect, it } from "vitest";

import { appPaths } from "./utils";

describe("appPaths", () => {
  it("uses the packaged executable names", () => {
    expect(basename(appPaths.win32!)).toBe("ProLens.exe");
    expect(basename(appPaths.linux!)).toBe("prolens");
    expect(basename(appPaths.darwin!)).toBe("ProLens");
  });
});
