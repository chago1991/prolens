/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemsInjectable } from "@freelensapp/cluster-sidebar";
import { beforeEach, describe, expect, it } from "vitest";
import sidebarNavigationCommandsInjectable from "../../renderer/components/command-palette/registered-commands/sidebar-navigation-commands.injectable";
import { getApplicationBuilder } from "../../renderer/components/test-utils/get-application-builder";

import type { SidebarItemDeclaration } from "@freelensapp/cluster-sidebar";

import type { DiContainer } from "@ogre-tools/injectable";

const flatten = (items: readonly SidebarItemDeclaration[]): SidebarItemDeclaration[] =>
  items.flatMap((item) => [item, ...flatten(item.children)]);

// The command palette reads the sidebar items in the root frame, where stores
// cannot be created. The Gateway API items must not create any there.
describe("Gateway API sidebar items outside cluster frames", () => {
  let windowDi: DiContainer;

  beforeEach(async () => {
    const builder = getApplicationBuilder();

    await builder.render();
    windowDi = builder.applicationWindow.only.di;
  });

  it("lets the command palette list its commands", () => {
    expect(() => windowDi.inject(sidebarNavigationCommandsInjectable).get()).not.toThrow();
  });

  it("reports the resource items as hidden", () => {
    const items = flatten(windowDi.inject(sidebarItemsInjectable).get()).filter((item) =>
      item.id.startsWith("sidebar-item-gateway-api-"),
    );

    expect(items.length).toBeGreaterThan(0);

    for (const item of items.filter((candidate) => candidate.id !== "sidebar-item-gateway-api-overview")) {
      expect(item.isVisible.get()).toBe(false);
    }
  });
});
