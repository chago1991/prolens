/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "@testing-library/jest-dom/vitest";

import { act, fireEvent, screen, within } from "@testing-library/react";
import { computed, observable, runInAction, toJS } from "mobx";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import directoryForKubeConfigsInjectable from "../../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import directoryForUserDataInjectable from "../../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import { Cluster } from "../../../../common/cluster/cluster";
import hostedClusterInjectable from "../../../../renderer/cluster-frame-context/hosted-cluster.injectable";
import showDetailsInjectable from "../../../../renderer/components/kube-detail-params/show-details.injectable";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import subscribeStoresInjectable from "../../../../renderer/kube-watch-api/subscribe-stores.injectable";
import storesAndApisCanBeCreatedInjectable from "../../../../renderer/stores-apis-can-be-created.injectable";
import openSaveFileDialogInjectable from "../../../../renderer/utils/save-file.injectable";
import clusterSnapshotSourceInjectable from "../cluster-snapshot.injectable";
import explorerSettingsInjectable, { defaultExplorerSettings } from "../explorer-settings.injectable";
import { deploymentWithPods, everythingLoaded, object, resetUids } from "../graph/__tests__/fixtures";
import { nodeId } from "../graph/build-graph";
import { ArchitectureExplorer } from "./architecture-explorer";

import type { DiContainer } from "@ogre-tools/injectable";
import type { Mock } from "vitest";

import type { ShowDetails } from "../../../../renderer/components/kube-detail-params/show-details.injectable";
import type { SubscribeStores } from "../../../../renderer/kube-watch-api/kube-watch-api";
import type { StorageLayer } from "../../../../renderer/utils/storage-helper";
import type { ClusterSnapshotSource } from "../cluster-snapshot.injectable";
import type { ExplorerSettings } from "../explorer-settings.injectable";
import type { ResourceObject } from "../graph/types";

const crashLooping = {
  phase: "Running",
  conditions: [{ type: "Ready", status: "False" }],
  containerStatuses: [
    {
      name: "app",
      ready: false,
      restartCount: 4,
      state: { waiting: { reason: "CrashLoopBackOff", message: "back-off" } },
    },
  ],
};

const memoryStorage = (initial: ExplorerSettings): StorageLayer<ExplorerSettings> => {
  const box = observable.box(initial, { deep: false });

  return {
    get: () => box.get(),
    set: (value) => runInAction(() => box.set(value)),
    merge: (value) => runInAction(() => box.set({ ...box.get(), ...(typeof value === "function" ? {} : value) })),
    reset: () => runInAction(() => box.set(initial)),
    isDefaultValue: (value) => value === initial,
  };
};

// React Flow measures its container and nodes; jsdom has no layout.
const originalOffset = {
  width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
  height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
};

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1600 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 1000 });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([1-9.])/)?.[1];

      this.m22 = scale ? Number(scale) : 1;
    }
  } as unknown as typeof DOMMatrixReadOnly;
});

afterAll(() => {
  if (originalOffset.width) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffset.width);
  if (originalOffset.height) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffset.height);
});

describe("<ArchitectureExplorer />", () => {
  let di: DiContainer;
  let objects: ReturnType<typeof observable.array<ResourceObject>>;
  let settings: StorageLayer<ExplorerSettings>;
  let showDetails: Mock<ShowDetails>;
  let saveFile: Mock<(filename: string, contents: BlobPart | BlobPart[], type: string) => void>;
  let subscribeStores: Mock<SubscribeStores>;

  const renderExplorer = async (initial: Partial<ExplorerSettings> = {}) => {
    settings = memoryStorage({ ...defaultExplorerSettings, ...initial });
    di.override(explorerSettingsInjectable, () => settings);

    const result = renderFor(di)(<ArchitectureExplorer />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    return result;
  };

  beforeEach(() => {
    resetUids();
    di = getDiForUnitTesting();
    di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    di.override(storesAndApisCanBeCreatedInjectable, () => true);
    di.override(
      hostedClusterInjectable,
      () => new Cluster({ contextName: "some-context", id: "some-cluster-id", kubeConfigPath: "/some-path" }),
    );

    const web = deploymentWithPods("web", { pods: 2, podStatus: crashLooping });

    objects = observable.array<ResourceObject>(
      [
        object("Node", "v1", "node-1", {
          namespace: null,
          status: { conditions: [{ type: "Ready", status: "True" }] },
        }),
        ...web.all,
        object("Service", "v1", "web", { spec: { selector: { app: "web" } } }),
        object("Service", "v1", "orphan", { spec: { selector: { app: "nothing" } } }),
        object("ServiceAccount", "v1", "default"),
      ],
      { deep: false },
    );

    const source: ClusterSnapshotSource = {
      stores: computed(() => []),
      snapshot: computed(() => ({ objects: objects.slice(), events: [], coverage: everythingLoaded })),
      unavailableKinds: computed(() => ["Secret"]),
      interrupted: computed(() => false),
      loading: computed(() => false),
      namespaces: computed(() => ["shop"]),
    };

    showDetails = vi.fn<ShowDetails>();
    saveFile = vi.fn();
    subscribeStores = vi.fn<SubscribeStores>(() => () => undefined);
    di.override(clusterSnapshotSourceInjectable, () => source);
    di.override(showDetailsInjectable, () => showDetails);
    di.override(openSaveFileDialogInjectable, () => saveFile);
    di.override(subscribeStoresInjectable, () => subscribeStores);
  });

  it("shows the resources of the cluster, aggregated, with a live status", async () => {
    await renderExplorer({ mode: "cluster" });

    expect(screen.getByTestId(`explorer-node-${nodeId("", "Service", "shop", "web")}`)).toBeInTheDocument();
    expect(screen.getByText("2 pods")).toBeInTheDocument();
    expect(screen.getByTestId("explorer-status")).toHaveTextContent("Live");
    expect(screen.getByTestId("explorer-status")).toHaveTextContent("Not available: Secret");
    expect(subscribeStores).toHaveBeenCalled();
  });

  it("asks for a resource in the dependency view, problems first, and diagnoses it", async () => {
    await renderExplorer({ mode: "application" });

    const picker = screen.getByTestId("explorer-focus-picker");

    expect(within(picker).getByText("orphan")).toBeInTheDocument();

    fireEvent.click(within(picker).getByText("web", { selector: "span" }).closest("button") as HTMLElement);
    await act(async () => undefined);

    const inspector = screen.getByTestId("explorer-inspector");

    expect(settings.get().focus).toBe(nodeId("", "Service", "shop", "web"));
    expect(within(inspector).getByText(/likely root cause/)).toBeInTheDocument();
    expect(within(inspector).getAllByText(/Root cause:/)[0]).toHaveTextContent("Root cause: Pod web-abc-0");
    expect(inspector).toHaveTextContent("CrashLoopBackOff");
  });

  it("inspects a node on click and opens its details drawer", async () => {
    await renderExplorer({ mode: "cluster" });

    fireEvent.click(screen.getByTestId(`explorer-node-${nodeId("", "Service", "shop", "orphan")}`));
    await act(async () => undefined);

    const inspector = screen.getByTestId("explorer-inspector");

    expect(inspector).toHaveTextContent("Selector app=nothing matches no pods in namespace shop");

    fireEvent.click(within(inspector).getByText("Details, events, YAML"));

    expect(showDetails).toHaveBeenCalledWith("/self/Service/shop/orphan");
  });

  it("explores a node's dependencies from its context menu", async () => {
    await renderExplorer({ mode: "cluster" });

    fireEvent.contextMenu(screen.getByTestId(`explorer-node-${nodeId("", "Service", "shop", "web")}`));
    await act(async () => undefined);
    fireEvent.click(within(screen.getByTestId("explorer-context-menu")).getByText("Explore dependencies"));
    await act(async () => undefined);

    expect(toJS(settings.get())).toMatchObject({ mode: "application", focus: nodeId("", "Service", "shop", "web") });
  });

  it("highlights search matches and counts them", async () => {
    await renderExplorer({ mode: "cluster" });

    fireEvent.change(screen.getByTestId("explorer-search"), { target: { value: "orphan" } });
    await act(async () => undefined);

    expect(screen.getByText("1 found")).toBeInTheDocument();
  });

  it("switches views from the toolbar", async () => {
    await renderExplorer({ mode: "cluster" });

    fireEvent.click(screen.getByTestId("explorer-mode-scheduling"));
    await act(async () => undefined);

    expect(settings.get().mode).toBe("scheduling");
    expect(screen.queryByTestId(`explorer-node-${nodeId("", "Service", "shop", "web")}`)).not.toBeInTheDocument();
  });

  it("follows changes of the cluster while open", async () => {
    await renderExplorer({ mode: "cluster" });

    await act(async () => {
      runInAction(() => objects.push(object("ConfigMap", "v1", "late-arrival")));
    });

    expect(screen.getByTestId(`explorer-node-${nodeId("", "ConfigMap", "shop", "late-arrival")}`)).toBeInTheDocument();
  });

  it("exports the current view as SVG", async () => {
    await renderExplorer({ mode: "cluster" });

    fireEvent.click(screen.getByText("Export"));
    fireEvent.click(screen.getByText("SVG (vector)"));
    await act(async () => undefined);

    expect(saveFile).toHaveBeenCalledWith("architecture-cluster.svg", expect.stringContaining("<svg"), "image/svg+xml");
  });
});
