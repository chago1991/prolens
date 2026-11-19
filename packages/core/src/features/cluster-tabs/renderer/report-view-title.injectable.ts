/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sidebarItemsInjectable } from "@freelensapp/cluster-sidebar";
import { getInjectable } from "@ogre-tools/injectable";
import { reaction } from "mobx";
import broadcastMessageInjectable from "../../../common/ipc/broadcast-message.injectable";
import { beforeClusterFrameStartsSecondInjectionToken } from "../../../renderer/before-frame-starts/tokens";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import legacyOnChannelListenInjectable from "../../../renderer/ipc/legacy-channel-listen.injectable";
import { activeTitleOf } from "../common/active-title";
import { clusterTabTitleChannel, clusterTabTitleRequestChannel } from "../common/channel";

/**
 * Tells the root frame which view this cluster frame shows, so that its tab
 * can be labelled like "Pods - my-cluster".
 */
const reportClusterViewTitleInjectable = getInjectable({
  id: "report-cluster-view-title",
  instantiate: (di) => ({
    run: () => {
      const clusterId = di.inject(hostedClusterIdInjectable);

      if (!clusterId) return;

      const sidebarItems = di.inject(sidebarItemsInjectable);
      const broadcastMessage = di.inject(broadcastMessageInjectable);
      const onChannel = di.inject(legacyOnChannelListenInjectable);
      const title = () => activeTitleOf(sidebarItems.get());

      const report = (value: string | undefined) => {
        try {
          void broadcastMessage(clusterTabTitleChannel, clusterId, value ?? null).catch(() => undefined);
        } catch {
          // The title is decoration: a frame that cannot report it keeps working.
        }
      };

      reaction(title, report, { fireImmediately: true });
      onChannel(clusterTabTitleRequestChannel, () => report(title()));
    },
  }),
  injectionToken: beforeClusterFrameStartsSecondInjectionToken,
});

export default reportClusterViewTitleInjectable;
