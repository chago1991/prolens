/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { cssNames } from "@freelensapp/utilities";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observer } from "mobx-react";
import clusterTabsInjectable from "./cluster-tabs.injectable";
import styles from "./cluster-tabs.module.scss";

import type { ClusterTab, ClusterTabs as ClusterTabsModel } from "./cluster-tabs.injectable";

interface Dependencies {
  model: ClusterTabsModel;
}

const Tab = observer(({ tab, model }: { tab: ClusterTab; model: ClusterTabsModel }) => (
  <div
    role="tab"
    aria-selected={tab.isActive}
    title={tab.label}
    data-testid={`cluster-tab-${tab.clusterId}`}
    className={cssNames(styles.tab, { [styles.active]: tab.isActive })}
    onClick={() => model.activate(tab.clusterId)}
    onAuxClick={(event) => {
      if (event.button === 1) model.close(tab.clusterId);
    }}
  >
    <span className={cssNames(styles.status, { [styles.connected]: tab.isConnected })} />
    <span className={styles.label}>{tab.label}</span>
    <button
      type="button"
      className={styles.close}
      aria-label={`Close ${tab.clusterName}`}
      data-testid={`cluster-tab-close-${tab.clusterId}`}
      onClick={(event) => {
        event.stopPropagation();
        model.close(tab.clusterId);
      }}
    >
      ×
    </button>
  </div>
));

/**
 * One tab per cluster opened in this window, with a tab for everything
 * else (the welcome page, the catalog, preferences) in front. Shown once a
 * cluster is open.
 */
const NonInjectedClusterTabs = observer(({ model }: Dependencies) => {
  const tabs = model.tabs.get();

  if (tabs.length === 0) return null;

  return (
    <div className={styles.tabs} role="tablist" data-testid="cluster-tabs">
      <div
        role="tab"
        aria-selected={model.homeIsActive.get()}
        data-testid="cluster-tab-home"
        className={cssNames(styles.tab, styles.home, { [styles.active]: model.homeIsActive.get() })}
        onClick={() => model.goHome()}
      >
        <Icon material="home" small />
        <span className={styles.label}>Welcome</span>
      </div>
      {tabs.map((tab) => (
        <Tab key={tab.clusterId} tab={tab} model={model} />
      ))}
    </div>
  );
});

export const ClusterTabs = withInjectables<Dependencies>(NonInjectedClusterTabs, {
  getProps: (di) => ({ model: di.inject(clusterTabsInjectable) }),
});
