/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { act, fireEvent } from "@testing-library/react";
import { computed, observable, runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import navigateToClusterViewInjectable from "../../../common/front-end-routing/routes/cluster-view/navigate-to-cluster-view.injectable";
import navigateToWelcomeInjectable from "../../../common/front-end-routing/routes/welcome/navigate-to-welcome.injectable";
import broadcastMessageInjectable from "../../../common/ipc/broadcast-message.injectable";
import clusterViewRouteParametersInjectable from "../../../renderer/components/cluster-manager/cluster-view-route-parameters.injectable";
import { renderFor } from "../../../renderer/components/test-utils/renderFor";
import { getDiForUnitTesting } from "../../../renderer/getDiForUnitTesting";
import legacyOnChannelListenInjectable from "../../../renderer/ipc/legacy-channel-listen.injectable";
import getClusterByIdInjectable from "../../cluster/storage/common/get-by-id.injectable";
import { clusterTabTitleChannel } from "../common/channel";
import { ClusterTabs } from "./cluster-tabs";

import type { DiContainer } from "@ogre-tools/injectable";
import type { Mock } from "vitest";

import type { Cluster } from "../../../common/cluster/cluster";

const fakeCluster = (id: string, name: string, connected = true) =>
  ({
    id,
    name: computed(() => name),
    disconnected: observable.box(!connected),
  }) as unknown as Cluster;

describe("cluster tabs", () => {
  let di: DiContainer;
  let activeClusterId: ReturnType<typeof observable.box<string>>;
  let navigateToClusterView: Mock<(clusterId: string) => void>;
  let navigateToWelcome: Mock<() => void>;
  let channelListeners: Map<string, (...args: unknown[]) => void>;
  const clusters = new Map([
    ["c1", fakeCluster("c1", "Home-Cluster")],
    ["c2", fakeCluster("c2", "Prod", false)],
  ]);

  const open = (id: string) => act(() => runInAction(() => activeClusterId.set(id)));

  beforeEach(() => {
    di = getDiForUnitTesting();
    activeClusterId = observable.box("");
    navigateToClusterView = vi.fn((id: string) => open(id));
    navigateToWelcome = vi.fn(() => open(""));
    channelListeners = new Map();

    di.override(clusterViewRouteParametersInjectable, () => ({
      clusterId: computed(() => activeClusterId.get()),
    }));
    di.override(getClusterByIdInjectable, () => (id: string) => clusters.get(id));
    di.override(navigateToClusterViewInjectable, () => navigateToClusterView);
    di.override(navigateToWelcomeInjectable, () => navigateToWelcome);
    di.override(broadcastMessageInjectable, () => async () => {});
    di.override(legacyOnChannelListenInjectable, () => (channel: string, listener: (...args: any[]) => any) => {
      channelListeners.set(channel, listener);

      return () => channelListeners.delete(channel);
    });
  });

  it("shows nothing until a cluster is opened", () => {
    const result = renderFor(di)(<ClusterTabs />);

    expect(result.queryByTestId("cluster-tabs")).toBeNull();
  });

  describe("given two clusters were opened", () => {
    let result: ReturnType<ReturnType<typeof renderFor>>;

    beforeEach(() => {
      result = renderFor(di)(<ClusterTabs />);
      open("c1");
      open("c2");
    });

    it("shows a tab for each, and the active one selected", () => {
      expect(result.getByTestId("cluster-tab-c1").textContent).toContain("Home-Cluster");
      expect(result.getByTestId("cluster-tab-c2").getAttribute("aria-selected")).toBe("true");
      expect(result.getByTestId("cluster-tab-c1").getAttribute("aria-selected")).toBe("false");
    });

    it("labels a tab with the view its cluster frame reports", () => {
      act(() => channelListeners.get(clusterTabTitleChannel)?.({}, "c1", "Pods"));

      expect(result.getByTestId("cluster-tab-c1").textContent).toContain("Pods - Home-Cluster");
    });

    it("switches clusters on click", () => {
      fireEvent.click(result.getByTestId("cluster-tab-c1"));

      expect(navigateToClusterView).toHaveBeenCalledWith("c1");
    });

    it("goes home from the home tab", () => {
      fireEvent.click(result.getByTestId("cluster-tab-home"));

      expect(navigateToWelcome).toHaveBeenCalled();
      expect(result.getByTestId("cluster-tab-home").getAttribute("aria-selected")).toBe("true");
    });

    it("closing the active tab activates its neighbour", () => {
      fireEvent.click(result.getByTestId("cluster-tab-close-c2"));

      expect(result.queryByTestId("cluster-tab-c2")).toBeNull();
      expect(navigateToClusterView).toHaveBeenLastCalledWith("c1");
    });

    it("closing the last tab goes home and hides the bar", () => {
      fireEvent.click(result.getByTestId("cluster-tab-close-c2"));
      fireEvent.click(result.getByTestId("cluster-tab-close-c1"));

      expect(navigateToWelcome).toHaveBeenCalled();
      expect(result.queryByTestId("cluster-tabs")).toBeNull();
    });

    it("closing an inactive tab keeps the active cluster", () => {
      navigateToClusterView.mockClear();
      fireEvent.click(result.getByTestId("cluster-tab-close-c1"));

      expect(result.queryByTestId("cluster-tab-c1")).toBeNull();
      expect(navigateToClusterView).not.toHaveBeenCalled();
    });
  });
});
