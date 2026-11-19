/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { fireEvent, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import isWindowsInjectable from "../../../../common/vars/is-windows.injectable";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import createTerminalTabInjectable from "../../dock/terminal/create-terminal-tab.injectable";
import sendCommandInjectable from "../../dock/terminal/send-command.injectable";
import hideDetailsInjectable from "../../kube-detail-params/hide-details.injectable";
import { type DiRender, renderFor } from "../../test-utils/renderFor";
import { nodeBpfTracePresets, podBpfTracePresets } from "../bpf-trace-command";
import { NodeBpfTraceMenu, PodBpfTraceMenu } from "../bpf-trace-menu";

import type { DiContainer } from "@ogre-tools/injectable";
import type { Mock } from "vitest";

vi.mock("../../menu", () => ({
  __esModule: true,
  MenuItem: ({ onClick, children }: { onClick: (evt: unknown) => void; children?: React.ReactNode }) => (
    <div data-testid="menu-item" onClick={onClick}>
      {children}
    </div>
  ),
  SubMenu: ({ children }: { children?: React.ReactNode }) => <div data-testid="sub-menu">{children}</div>,
}));

const node = (os = "linux") => ({
  apiVersion: "v1",
  kind: "Node",
  metadata: { name: "worker-1", selfLink: "/api/v1/nodes/worker-1", labels: { "kubernetes.io/os": os } },
  spec: {},
});

const pod = ({ running = true, nodeName = "worker-1" } = {}) => ({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "web-0",
    namespace: "shop",
    selfLink: "/api/v1/namespaces/shop/pods/web-0",
    annotations: { "kubectl.kubernetes.io/default-container": "app" },
  },
  spec: {
    nodeName: nodeName || undefined,
    initContainers: [{ name: "init", image: "busybox" }],
    containers: [
      { name: "sidecar", image: "envoy" },
      { name: "app", image: "nginx" },
    ],
  },
  status: {
    phase: running ? "Running" : "Pending",
    initContainerStatuses: [{ name: "init", state: { terminated: {} } }],
    containerStatuses: [
      { name: "sidecar", state: running ? { running: {} } : { waiting: {} } },
      { name: "app", state: running ? { running: {} } : { waiting: {} } },
    ],
  },
});

describe("bpf-trace-menu", () => {
  let di: DiContainer;
  let render: DiRender;
  let createTerminalTabMock: Mock;
  let sendCommandMock: Mock;

  beforeEach(() => {
    di = getDiForUnitTesting();
    createTerminalTabMock = vi.fn();
    sendCommandMock = vi.fn(() => Promise.resolve());

    di.override(createTerminalTabInjectable, () => createTerminalTabMock);
    di.override(sendCommandInjectable, () => sendCommandMock);
    di.override(hideDetailsInjectable, () => vi.fn());
    di.override(isWindowsInjectable, () => false);

    render = renderFor(di);
  });

  const clickItem = (label: string) => {
    const item = screen.getAllByTestId("menu-item").find((element) => element.textContent === label);

    if (!item) throw new Error(`no menu item ${label}`);
    fireEvent.click(item);
  };

  describe("node", () => {
    it("renders nothing without an object", () => {
      const { container } = render(<NodeBpfTraceMenu object={null} toolbar={false} />);

      expect(container.firstChild).toBeNull();
    });

    it("renders nothing for a Windows node", () => {
      const { container } = render(<NodeBpfTraceMenu object={node("windows")} toolbar={false} />);

      expect(container.firstChild).toBeNull();
    });

    it("lists the node presets, a custom program and the trace runs", () => {
      render(<NodeBpfTraceMenu object={node()} toolbar={false} />);

      const labels = screen.getAllByTestId("menu-item").map((element) => element.textContent);

      expect(labels.slice(1)).toEqual([
        ...nodeBpfTracePresets.map((preset) => preset.name),
        "Custom program…",
        "List trace runs",
      ]);
    });

    it("runs a preset in a new terminal tab", () => {
      render(<NodeBpfTraceMenu object={node()} toolbar={false} />);

      clickItem("TCP connections (tcpconnect)");

      const [{ id: tabId, title }] = createTerminalTabMock.mock.calls[0];

      expect(title).toBe("bpftrace: node/worker-1");
      expect(sendCommandMock).toHaveBeenCalledWith(
        `kubectl trace run 'node/worker-1' --attach -e 'kprobe:tcp_connect { printf("%-6d %s\\n", pid, comm); }'`,
        { enter: true, tabId },
      );
    });

    it("leaves a custom program on the prompt without running it", () => {
      render(<NodeBpfTraceMenu object={node()} toolbar={false} />);

      clickItem("Custom program…");

      expect(sendCommandMock).toHaveBeenCalledWith("kubectl trace run 'node/worker-1' --attach -e ''", {
        enter: false,
        tabId: expect.any(String),
      });
    });

    it("does nothing when the parent item is clicked", () => {
      render(<NodeBpfTraceMenu object={node()} toolbar={false} />);

      fireEvent.click(screen.getAllByTestId("menu-item")[0]);

      expect(sendCommandMock).not.toHaveBeenCalled();
    });

    it("lists the trace runs of the cluster", () => {
      render(<NodeBpfTraceMenu object={node()} toolbar={false} />);

      clickItem("List trace runs");

      expect(sendCommandMock).toHaveBeenCalledWith("kubectl trace get --all-namespaces", {
        enter: true,
        tabId: expect.any(String),
      });
    });
  });

  describe("pod", () => {
    it("renders nothing for a pod without running containers", () => {
      const { container } = render(<PodBpfTraceMenu object={pod({ running: false })} toolbar={false} />);

      expect(container.firstChild).toBeNull();
    });

    it("renders nothing for a pod not scheduled to a node", () => {
      const { container } = render(<PodBpfTraceMenu object={pod({ nodeName: "" })} toolbar={false} />);

      expect(container.firstChild).toBeNull();
    });

    it("traces the default container of the pod", () => {
      render(<PodBpfTraceMenu object={pod()} toolbar={false} />);

      const preset = podBpfTracePresets[1];

      clickItem(preset.name);

      expect(createTerminalTabMock.mock.calls[0][0].title).toBe("bpftrace: pod/web-0 (namespace: shop)");
      expect(sendCommandMock.mock.calls[0][0]).toBe(
        `kubectl trace run 'pod/web-0' --target-namespace 'shop' --container 'app' --attach -e '${preset.program}'`,
      );
    });

    it("quotes for PowerShell on Windows", () => {
      di.override(isWindowsInjectable, () => true);
      render(<PodBpfTraceMenu object={pod()} toolbar={false} />);

      clickItem("Custom program…");

      expect(sendCommandMock.mock.calls[0][0]).toBe(
        "kubectl trace run 'pod/web-0' --target-namespace 'shop' --container 'app' --attach -e ''",
      );
    });
  });
});
