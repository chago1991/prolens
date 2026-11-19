/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DiContainer } from "@ogre-tools/injectable";
import "@testing-library/jest-dom/vitest";

import { podListLayoutColumnInjectionToken } from "@freelensapp/list-layout";
import { act, fireEvent } from "@testing-library/react";
import appPathsStateInjectable from "../../../common/app-paths/app-paths-state.injectable";
import directoryForKubeConfigsInjectable from "../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import { Cluster } from "../../../common/cluster/cluster";
import isTableColumnHiddenInjectable from "../../../features/user-preferences/common/is-table-column-hidden.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import subscribeStoresInjectable from "../../kube-watch-api/subscribe-stores.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import dockStoreInjectable from "../dock/dock/store.injectable";
import kubeSelectedUrlParamInjectable from "../kube-detail-params/kube-selected-url.injectable";
import toggleKubeDetailsPaneInjectable from "../kube-detail-params/toggle-details.injectable";
import { renderFor } from "../test-utils/renderFor";
import podStoreInjectable from "../workloads-pods/store.injectable";
import { KubeObjectListLayout } from "./index";

import type { RenderResult } from "@testing-library/react";

import type { DiRender } from "../test-utils/renderFor";
import type { PodStore } from "../workloads-pods/store";

describe("kube-object-list-layout", () => {
  let di: DiContainer;
  let render: DiRender;
  let podStore: PodStore;

  beforeEach(() => {
    di = getDiForUnitTesting();

    di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    di.override(storesAndApisCanBeCreatedInjectable, () => true);
    di.override(isTableColumnHiddenInjectable, () => () => false);

    di.override(
      hostedClusterInjectable,
      () =>
        new Cluster({
          contextName: "some-context-name",
          id: "some-cluster-id",
          kubeConfigPath: "/some-path-to-a-kubeconfig",
        }),
    );

    render = renderFor(di);

    di.override(subscribeStoresInjectable, () => vi.fn().mockImplementation(() => vi.fn()));
    di.override(kubeSelectedUrlParamInjectable, () => ({
      get: () => "path",
    }));
    di.override(toggleKubeDetailsPaneInjectable, () => null);
    di.override(appPathsStateInjectable, () => ({
      get: () => ({}),
    }));

    podStore = di.inject(podStoreInjectable);
  });

  describe("given pod store", () => {
    let result: RenderResult;

    it("renders", () => {
      result = render(
        <div>
          <KubeObjectListLayout
            className="Pods"
            store={podStore}
            tableId="workloads_pods"
            isConfigurable
            renderHeaderTitle="Pods"
            renderTableContents={(pod) => [<div key={pod.getName()}>{pod.getName()}</div>]}
            columns={di.injectMany(podListLayoutColumnInjectionToken)}
          />
        </div>,
      );

      expect(result.baseElement).toMatchSnapshot();
    });

    describe("given the list is shown", () => {
      const header = (id: string) =>
        result.baseElement.querySelector(`.TableHead .TableCell[id="${id}"]`) as HTMLElement;
      const orderOf = (id: string) => Number(header(id).style.order);
      const dataTransfer = { setData: () => {}, effectAllowed: "", dropEffect: "" };

      beforeEach(() => {
        result = render(
          <KubeObjectListLayout
            className="Pods"
            store={podStore}
            tableId="workloads_pods"
            isConfigurable
            renderHeaderTitle="Pods"
            renderTableContents={(pod) => [<div key={pod.getName()}>{pod.getName()}</div>]}
            columns={di.injectMany(podListLayoutColumnInjectionToken)}
          />,
        );
      });

      it("moves a column by dragging its header onto another", () => {
        expect(orderOf("name")).toBeLessThan(orderOf("node"));

        // jsdom has no layout: the pointer is over the right half of the target.
        fireEvent.dragStart(header("name"), { dataTransfer });
        fireEvent.dragOver(header("node"), { dataTransfer });
        fireEvent.drop(header("node"), { dataTransfer });

        expect(orderOf("name")).toBe(orderOf("node") + 1);
      });

      it("opens the create resource editor for the kind from the add button", () => {
        fireEvent.click(result.baseElement.querySelector(".AddRemoveButtons .add-button") as HTMLElement);

        expect(di.inject(dockStoreInjectable).tabs.map((tab) => tab.title)).toContain("Create Pod");
      });
    });

    describe("when a watch of the store is interrupted", () => {
      const interruptedWatches = () => (podStore as unknown as { interruptedWatches: Set<string> }).interruptedWatches;
      const renderList = () =>
        render(
          <KubeObjectListLayout
            className="Pods"
            store={podStore}
            tableId="workloads_pods"
            renderHeaderTitle="Pods"
            renderTableContents={(pod) => [<div key={pod.getName()}>{pod.getName()}</div>]}
          />,
        );

      it("says nothing while the watches are connected", () => {
        result = renderList();

        expect(result.queryByTestId("kube-object-list-layout-watch-interrupted")).not.toBeInTheDocument();
      });

      it("shows that the list may be out of date until the watch reconnects", () => {
        result = renderList();

        act(() => runInAction(() => interruptedWatches().add("default")));
        expect(result.getByTestId("kube-object-list-layout-watch-interrupted")).toBeInTheDocument();

        act(() => runInAction(() => interruptedWatches().delete("default")));
        expect(result.queryByTestId("kube-object-list-layout-watch-interrupted")).not.toBeInTheDocument();
      });
    });

    describe("given resourcename", () => {
      it("uses resourcename in search placeholder", () => {
        result = render(
          <div>
            <KubeObjectListLayout
              className="Pods"
              store={podStore}
              tableId="workloads_pods"
              isConfigurable
              renderHeaderTitle="Pods"
              renderTableContents={(pod) => [<div key={pod.getName()}>{pod.getName()}</div>]}
              resourceName="My Custom Items"
              searchFilters={[() => null]}
            />
          </div>,
        );

        expect(result.getByPlaceholderText("Search My Custom Items...")).toBeInTheDocument();
      });
    });
  });
});
