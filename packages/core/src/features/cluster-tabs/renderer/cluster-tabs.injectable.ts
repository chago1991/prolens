/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { action, computed, observable, reaction } from "mobx";
import navigateToClusterViewInjectable from "../../../common/front-end-routing/routes/cluster-view/navigate-to-cluster-view.injectable";
import navigateToWelcomeInjectable from "../../../common/front-end-routing/routes/welcome/navigate-to-welcome.injectable";
import broadcastMessageInjectable from "../../../common/ipc/broadcast-message.injectable";
import clusterViewRouteParametersInjectable from "../../../renderer/components/cluster-manager/cluster-view-route-parameters.injectable";
import legacyOnChannelListenInjectable from "../../../renderer/ipc/legacy-channel-listen.injectable";
import getClusterByIdInjectable from "../../cluster/storage/common/get-by-id.injectable";
import { clusterTabLabel } from "../common/active-title";
import { clusterTabTitleChannel, clusterTabTitleRequestChannel } from "../common/channel";

export interface ClusterTab {
  readonly clusterId: string;
  readonly label: string;
  readonly clusterName: string;
  readonly isActive: boolean;
  readonly isConnected: boolean;
}

export interface ClusterTabs {
  readonly tabs: { get(): ClusterTab[] };
  /** Whether no cluster tab is active: the welcome page, the catalog, preferences… */
  readonly homeIsActive: { get(): boolean };
  activate(clusterId: string): void;
  goHome(): void;
  close(clusterId: string): void;
}

/**
 * The clusters opened in this window, one tab each, in the order they were
 * opened. Closing a tab hides the cluster; it stays connected, as it does
 * when another cluster is opened from the hotbar.
 */
const clusterTabsInjectable = getInjectable({
  id: "cluster-tabs",
  instantiate: (di): ClusterTabs => {
    const { clusterId: activeClusterId } = di.inject(clusterViewRouteParametersInjectable);
    const getClusterById = di.inject(getClusterByIdInjectable);
    const navigateToClusterView = di.inject(navigateToClusterViewInjectable);
    const navigateToWelcome = di.inject(navigateToWelcomeInjectable);
    const onChannel = di.inject(legacyOnChannelListenInjectable);
    const broadcastMessage = di.inject(broadcastMessageInjectable);

    const openIds = observable.array<string>([], { deep: false });
    const titles = observable.map<string, string | undefined>();

    reaction(
      () => activeClusterId.get(),
      action((id) => {
        if (id && getClusterById(id) && !openIds.includes(id)) openIds.push(id);
      }),
      { fireImmediately: true },
    );

    onChannel(
      clusterTabTitleChannel,
      action((_event: unknown, clusterId: unknown, title: unknown) => {
        if (typeof clusterId === "string") titles.set(clusterId, typeof title === "string" ? title : undefined);
      }),
    );

    try {
      void broadcastMessage(clusterTabTitleRequestChannel).catch(() => undefined);
    } catch {
      // Titles arrive with the next navigation in the cluster frame.
    }

    const tabs = computed(() => {
      const active = activeClusterId.get();

      return openIds.flatMap((clusterId): ClusterTab[] => {
        const cluster = getClusterById(clusterId);

        if (!cluster) return [];

        const clusterName = cluster.name.get();

        return [
          {
            clusterId,
            clusterName,
            label: clusterTabLabel(clusterName, titles.get(clusterId)),
            isActive: clusterId === active,
            isConnected: !cluster.disconnected.get(),
          },
        ];
      });
    });

    return {
      tabs,
      homeIsActive: computed(() => !activeClusterId.get()),
      activate: (clusterId) => navigateToClusterView(clusterId),
      goHome: () => navigateToWelcome(),
      close: action((clusterId: string) => {
        const visible = tabs.get().map((tab) => tab.clusterId);
        const index = visible.indexOf(clusterId);

        openIds.remove(clusterId);

        if (activeClusterId.get() !== clusterId) return;

        const neighbour = visible.filter((id) => id !== clusterId)[Math.max(0, index - 1)];

        if (neighbour) navigateToClusterView(neighbour);
        else navigateToWelcome();
      }),
    };
  },
});

export default clusterTabsInjectable;
