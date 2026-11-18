/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { KubeObject } from "@freelensapp/kube-object";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import apiManagerInjectable from "../../common/k8s-api/api-manager/manager.injectable";
import hostedClusterInjectable from "../../renderer/cluster-frame-context/hosted-cluster.injectable";
import customResourceDefinitionStoreInjectable from "../../renderer/components/custom-resource-definitions/store.injectable";
import kubeDetailsUrlParamInjectable from "../../renderer/components/kube-detail-params/kube-details-url.injectable";
import { getApplicationBuilder } from "../../renderer/components/test-utils/get-application-builder";
import {
  navigateToGatewayApiOverviewInjectable,
  navigateToGatewayApiResourcesInjectable,
} from "./common/navigate.injectable";
import gatewayApiCanIInjectable from "./renderer/can-i.injectable";

import type { DiContainer } from "@ogre-tools/injectable";
import type { RenderResult } from "@testing-library/react";

import type { KubeApiResource } from "../../common/rbac";
import type { ApplicationBuilder } from "../../renderer/components/test-utils/get-application-builder";

const group = "gateway.networking.k8s.io";

const discovered: KubeApiResource[] = [
  { group: "", version: "v1", apiName: "services", kind: "Service", namespaced: true },
  { group, version: "v1", apiName: "gateways", kind: "Gateway", namespaced: true },
  { group, version: "v1", apiName: "gatewayclasses", kind: "GatewayClass", namespaced: false },
  { group, version: "v1", apiName: "httproutes", kind: "HTTPRoute", namespaced: true },
  { group, version: "v1beta1", apiName: "httproutes", kind: "HTTPRoute", namespaced: true },
  { group, version: "v1alpha2", apiName: "tcproutes", kind: "TCPRoute", namespaced: true },
];

const someGateway = new KubeObject({
  apiVersion: `${group}/v1`,
  kind: "Gateway",
  metadata: {
    name: "web",
    namespace: "default",
    selfLink: `/apis/${group}/v1/namespaces/default/gateways/web`,
    uid: "gateway-uid",
    resourceVersion: "1",
  },
  spec: {
    gatewayClassName: "cilium",
    listeners: [{ name: "http", port: 80, protocol: "HTTP" }],
  },
  status: {
    addresses: [{ type: "IPAddress", value: "10.1.2.3" }],
    conditions: [
      { type: "Accepted", status: "True", reason: "Accepted", lastTransitionTime: "2026-01-01T00:00:00Z", message: "" },
      {
        type: "Programmed",
        status: "True",
        reason: "Programmed",
        lastTransitionTime: "2026-01-01T00:00:00Z",
        message: "",
      },
    ],
    listeners: [{ name: "http", attachedRoutes: 2, supportedKinds: [{ kind: "HTTPRoute" }], conditions: [] }],
  },
} as any);

const someRoute = new KubeObject({
  apiVersion: `${group}/v1`,
  kind: "HTTPRoute",
  metadata: {
    name: "shop",
    namespace: "default",
    selfLink: `/apis/${group}/v1/namespaces/default/httproutes/shop`,
    uid: "route-uid",
    resourceVersion: "1",
  },
  spec: {
    parentRefs: [{ name: "web" }],
    hostnames: ["shop.example.com"],
    rules: [{ matches: [{ path: { type: "PathPrefix", value: "/" } }], backendRefs: [{ name: "shop", port: 80 }] }],
  },
  status: {
    parents: [
      {
        parentRef: { name: "web" },
        controllerName: "io.cilium/gateway-controller",
        conditions: [{ type: "Accepted", status: "False", reason: "NotAllowedByListeners" }],
      },
    ],
  },
} as any);

describe("Gateway API in the cluster frame", () => {
  let builder: ApplicationBuilder;
  let result: RenderResult;
  let windowDi: DiContainer;

  const expandGatewayApi = async () => {
    await waitFor(() => result.getByTestId("expand-icon-for-sidebar-item-network").click(), { timeout: 300 });
    await waitFor(() => result.getByTestId("expand-icon-for-sidebar-item-gateway-api").click(), { timeout: 300 });
  };

  beforeEach(async () => {
    builder = getApplicationBuilder();
    builder.setEnvironmentToClusterFrame();
    builder.beforeWindowStart(({ windowDi }) => {
      windowDi.override(gatewayApiCanIInjectable, () => async () => true);
    });

    result = await builder.render();
    windowDi = builder.applicationWindow.only.di;

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const crdStore = windowDi.inject(customResourceDefinitionStoreInjectable);

    await act(async () => {
      vi.spyOn(crdStore.api, "list").mockRejectedValue(new Error("forbidden"));
      await crdStore.loadAll();
    });

    builder.namespaces.add("default");
    builder.namespaces.select("default");
  });

  describe("when the cluster serves the Gateway API", () => {
    beforeEach(async () => {
      const hostedCluster = windowDi.inject(hostedClusterInjectable);

      hostedCluster?.knownResources.replace(discovered);
      // RBAC lets the user list gateways and routes, but not TCP routes.
      builder.allowKubeResource({ group: "", apiName: "services" });
      builder.allowKubeResource({ group, apiName: "gateways" });
      builder.allowKubeResource({ group, apiName: "gatewayclasses" });
      builder.allowKubeResource({ group, apiName: "httproutes" });

      await expandGatewayApi();
    });

    it("shows the Gateway API section under Network", () => {
      expect(result.getByTestId("sidebar-item-gateway-api")).toHaveTextContent("Gateway API");
    });

    it.each([
      ["sidebar-item-gateway-api-gateways", "Gateways"],
      ["sidebar-item-gateway-api-gatewayclasses", "Gateway Classes"],
      ["sidebar-item-gateway-api-httproutes", "HTTP Routes"],
      ["sidebar-item-gateway-api-topology", "Topology"],
    ])("shows %s", (testId, title) => {
      expect(result.getByTestId(testId)).toHaveTextContent(title);
    });

    it("hides resources RBAC refuses and resources the cluster does not serve", () => {
      expect(result.queryByTestId("sidebar-item-gateway-api-tcproutes")).not.toBeInTheDocument();
      expect(result.queryByTestId("sidebar-item-gateway-api-grpcroutes")).not.toBeInTheDocument();
      expect(result.queryByTestId("sidebar-item-gateway-api-listenersets")).not.toBeInTheDocument();
    });

    describe("when Gateways are opened", () => {
      beforeEach(async () => {
        const apiManager = windowDi.inject(apiManagerInjectable);

        apiManager.getStore(`/apis/${group}/v1/gateways`)?.items.replace([someGateway]);
        act(() => windowDi.inject(navigateToGatewayApiResourcesInjectable)("gateways"));
      });

      it("lists the Gateways with their columns", async () => {
        await waitFor(() => expect(result.container.querySelectorAll(".GatewayApi .TableRow")).toHaveLength(1), {
          timeout: 500,
        });

        const row = result.container.querySelector(".GatewayApi .TableRow");

        expect(row).toHaveTextContent("web");
        expect(row).toHaveTextContent("cilium");
        expect(row).toHaveTextContent("10.1.2.3");
        expect(row).toHaveTextContent("http HTTP:80");
      });

      it("shows the served version", async () => {
        await waitFor(() => expect(result.getByText(`${group}/v1`)).toBeInTheDocument(), { timeout: 500 });
      });

      describe("when a Gateway is opened in the details", () => {
        beforeEach(() => {
          act(() => windowDi.inject(kubeDetailsUrlParamInjectable).set(someGateway.selfLink));
        });

        it("shows the Gateway details with listeners and status", async () => {
          await waitFor(() => expect(result.getByTestId("gateway-api-details-gateways")).toBeInTheDocument(), {
            timeout: 500,
          });

          const details = result.getByTestId("gateway-api-details-gateways");

          expect(details).toHaveTextContent("Listeners (1)");
          expect(details).toHaveTextContent("HTTP:80");
          expect(details).toHaveTextContent("Programmed");
          expect(details).toHaveTextContent("Show in Gateway API topology");
        });

        it("opens the visual listener editor", async () => {
          await waitFor(() => result.getByText("Edit listeners"), { timeout: 500 });
          act(() => result.getByText("Edit listeners").click());

          expect(result.getByTestId("gateway-api-listener-editor")).toBeInTheDocument();
          expect(result.getByText("+ Add listener")).toBeInTheDocument();
        });

        describe("when a listener is added in the editor", () => {
          let patch: ReturnType<typeof vi.fn>;

          const applyButton = () =>
            [...result.getByTestId("gateway-api-listener-editor").querySelectorAll("button")].find(
              (button) => button.textContent === "Apply",
            ) as HTMLButtonElement;

          beforeEach(async () => {
            const store = windowDi.inject(apiManagerInjectable).getStore(`/apis/${group}/v1/gateways`)!;

            patch = vi.fn().mockResolvedValue(someGateway);
            vi.spyOn(store, "patch").mockImplementation(patch as any);

            await waitFor(() => result.getByText("Edit listeners"), { timeout: 500 });
            act(() => result.getByText("Edit listeners").click());
            act(() => result.getByText("+ Add listener").click());
          });

          it("summarises the draft", () => {
            expect(result.getByTestId("gateway-api-listener-editor")).toHaveTextContent(
              "2 listeners (1 added, 0 removed)",
            );
          });

          it("rejects a conflicting listener", () => {
            const portInputs = result
              .getByTestId("gateway-api-listener-editor")
              .querySelectorAll('input[type="number"]');

            // The new listener gets port 80 like the first one: same port, protocol and hostname conflict.
            expect(portInputs).toHaveLength(2);
            expect(result.getByTestId("gateway-api-listener-editor")).toHaveTextContent("they conflict");
            expect(applyButton()).toBeDisabled();
          });

          describe("when the conflict is fixed and Apply is confirmed", () => {
            beforeEach(async () => {
              const portInputs = result
                .getByTestId("gateway-api-listener-editor")
                .querySelectorAll('input[type="number"]');

              fireEvent.change(portInputs[1], { target: { value: "8080" } });
              act(() => applyButton().click());
              await waitFor(() => result.getByTestId("confirmation-dialog"), { timeout: 500 });
              act(() => result.getByTestId("confirm").click());
            });

            it("sends a merge patch of the listeners that carries the resourceVersion", async () => {
              await waitFor(() => expect(patch).toHaveBeenCalled(), { timeout: 500 });

              const [, body, strategy] = patch.mock.calls[0];

              expect(strategy).toBe("merge");
              expect(body.metadata).toEqual({ resourceVersion: "1" });
              expect(body.spec.listeners).toEqual([
                { name: "http", port: 80, protocol: "HTTP" },
                { name: "listener-2", port: 8080, protocol: "HTTP" },
              ]);
            });
          });

          describe("when the conflict is fixed and Apply is cancelled", () => {
            beforeEach(async () => {
              const portInputs = result
                .getByTestId("gateway-api-listener-editor")
                .querySelectorAll('input[type="number"]');

              fireEvent.change(portInputs[1], { target: { value: "8080" } });
              act(() => applyButton().click());
              await waitFor(() => result.getByTestId("confirmation-dialog"), { timeout: 500 });
              act(() =>
                (result.getByTestId("confirmation-dialog").querySelector(".cancel") as HTMLButtonElement).click(),
              );
            });

            it("does not change the object", async () => {
              await waitFor(() => expect(result.queryByTestId("confirmation-dialog")).not.toBeInTheDocument(), {
                timeout: 500,
              });
              expect(patch).not.toHaveBeenCalled();
            });
          });
        });
      });
    });

    describe("when a rejected HTTPRoute is opened in the details", () => {
      beforeEach(() => {
        const apiManager = windowDi.inject(apiManagerInjectable);

        apiManager.getStore(`/apis/${group}/v1/httproutes`)?.items.replace([someRoute]);
        act(() => windowDi.inject(kubeDetailsUrlParamInjectable).set(someRoute.selfLink));
      });

      it("shows the rejection, rules and backends", async () => {
        await waitFor(() => expect(result.getByTestId("gateway-api-details-httproutes")).toBeInTheDocument(), {
          timeout: 500,
        });

        const details = result.getByTestId("gateway-api-details-httproutes");

        expect(details).toHaveTextContent("rejected");
        expect(details).toHaveTextContent("NotAllowedByListeners");
        expect(details).toHaveTextContent("shop.example.com");
        expect(details).toHaveTextContent("shop:80");
      });
    });

    describe("when a resource the user may not list is opened", () => {
      beforeEach(() => {
        act(() => windowDi.inject(navigateToGatewayApiResourcesInjectable)("tcproutes"));
      });

      it("explains the missing permission", async () => {
        await waitFor(() => expect(result.getByTestId("gateway-api-unavailable")).toHaveTextContent("RBAC"), {
          timeout: 500,
        });
      });
    });

    describe("when the overview is opened", () => {
      beforeEach(() => {
        act(() => windowDi.inject(navigateToGatewayApiOverviewInjectable)());
      });

      it("shows each kind with its state and version", async () => {
        await waitFor(() => expect(result.getByTestId("gateway-api-overview")).toBeInTheDocument(), { timeout: 500 });
        expect(result.getByTestId("gateway-api-tile-httproutes")).toHaveTextContent("Available");
        expect(result.getByTestId("gateway-api-tile-httproutes")).toHaveTextContent("v1");
        expect(result.getByTestId("gateway-api-tile-tcproutes")).toHaveTextContent("No permission");
        expect(result.getByTestId("gateway-api-tile-grpcroutes")).toHaveTextContent("Not installed");
      });
    });
  });

  describe("when the cluster has no Gateway API", () => {
    beforeEach(async () => {
      windowDi.inject(hostedClusterInjectable)?.knownResources.replace([discovered[0]]);
      builder.allowKubeResource({ group: "", apiName: "services" });
      await expandGatewayApi();
    });

    it("shows only the overview", () => {
      expect(result.getByTestId("sidebar-item-gateway-api-overview")).toBeInTheDocument();
      expect(result.queryByTestId("sidebar-item-gateway-api-gateways")).not.toBeInTheDocument();
      expect(result.queryByTestId("sidebar-item-gateway-api-topology")).not.toBeInTheDocument();
    });

    it("shows installation guidance", async () => {
      act(() => windowDi.inject(navigateToGatewayApiOverviewInjectable)());

      await waitFor(
        () => expect(result.getByTestId("gateway-api-not-installed")).toHaveTextContent("standard-install.yaml"),
        {
          timeout: 500,
        },
      );
    });
  });
});
