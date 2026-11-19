/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { fireEvent, screen } from "@testing-library/react";
import directoryForLensLocalStorageInjectable from "../../../../common/directory-for-lens-local-storage/directory-for-lens-local-storage.injectable";
import openAskAiInjectable from "../../../../features/ai-tools/renderer/open-ask-ai.injectable";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import eventStoreInjectable from "../../events/store.injectable";
import { renderFor } from "../../test-utils/renderFor";
import getRelatedPodsInjectable from "../get-related-pods.injectable";
import { KubeObjectWarningIndicator } from "../kube-object-warning-indicator";
import { crashingPod, healthyPod, warningEvent } from "./fixtures";

import type { Mock } from "vitest";

import type { AskAiRequest } from "../../../../features/ai-tools/common/ask-ai-request";
import type { DiRender } from "../../test-utils/renderFor";

describe("<KubeObjectWarningIndicator />", () => {
  let render: DiRender;
  let openAskAi: Mock<(request: AskAiRequest) => Promise<void>>;
  let events: ReturnType<typeof warningEvent>[];

  beforeEach(() => {
    const di = getDiForUnitTesting();

    events = [warningEvent("BackOff", "Back-off restarting failed container web", "2026-01-01T10:00:00Z", 7)];
    openAskAi = vi.fn(async () => {});

    di.override(directoryForLensLocalStorageInjectable, () => "some-directory-for-lens-local-storage");
    di.override(eventStoreInjectable, () => ({ getEventsByObject: () => events }) as never);
    di.override(getRelatedPodsInjectable, () => (object) => [object as never]);
    di.override(openAskAiInjectable, () => openAskAi);

    render = renderFor(di);
  });

  const openPopover = () => fireEvent.click(screen.getByTestId("kube-object-warning-indicator"));

  it("renders nothing for an object without warnings", () => {
    const { container } = render(<KubeObjectWarningIndicator object={healthyPod()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the number of warnings and a label for screen readers", () => {
    render(<KubeObjectWarningIndicator object={crashingPod()} />);

    const indicator = screen.getByTestId("kube-object-warning-indicator");

    expect(indicator).toHaveAccessibleName("2 warnings for Pod web-1");
    expect(indicator).toHaveAttribute("aria-expanded", "false");
    expect(indicator).toHaveTextContent("2");
  });

  it("opens a popover with each warning's reason, message and count on click", () => {
    render(<KubeObjectWarningIndicator object={crashingPod()} />);
    openPopover();

    const popover = screen.getByRole("dialog", { name: "Warnings (2)" });

    expect(popover.parentElement).toBe(document.body);
    expect(screen.getByTestId("kube-object-warning-indicator")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByTestId("kube-object-warning").map((item) => item.textContent)).toEqual([
      expect.stringContaining("CrashLoopBackOff"),
      expect.stringMatching(/BackOff×7.*ago.*Back-off restarting failed container web/),
    ]);
  });

  it("titles a single warning 'Warning'", () => {
    events = [];
    render(<KubeObjectWarningIndicator object={crashingPod()} />);
    openPopover();

    expect(screen.getByRole("dialog", { name: "Warning" })).toBeInTheDocument();
  });

  it("does not pass the click on to the table row", () => {
    const onRowClick = vi.fn();

    render(
      <div onClick={onRowClick}>
        <KubeObjectWarningIndicator object={crashingPod()} />
      </div>,
    );
    openPopover();
    fireEvent.click(screen.getByRole("dialog"));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("closes with the close button, with Escape, and on a click outside", () => {
    render(<KubeObjectWarningIndicator object={crashingPod()} />);

    openPopover();
    fireEvent.click(screen.getByTestId("warning-popover-close"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openPopover();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("kube-object-warning-indicator")).toHaveFocus();

    openPopover();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("toggles closed when the icon is clicked again", () => {
    render(<KubeObjectWarningIndicator object={crashingPod()} />);

    openPopover();
    openPopover();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks AI about the warnings with the diagnostic context, and closes", () => {
    render(<KubeObjectWarningIndicator object={crashingPod()} />);
    openPopover();
    fireEvent.click(screen.getByTestId("kube-object-warning-ask-ai"));

    expect(openAskAi).toHaveBeenCalledTimes(1);

    const [request] = openAskAi.mock.calls[0];

    expect(request.presetId).toBe("explain-warning");
    expect(request.target).toMatchObject({
      type: "resource",
      resource: { kind: "Pod", name: "web-1", namespace: "shop", uid: "uid-web-1" },
      diagnostics: {
        warnings: [
          { source: "status", reason: "CrashLoopBackOff" },
          { source: "event", reason: "BackOff", count: 7, timestamp: "2026-01-01T10:00:00Z" },
        ],
        pods: [{ name: "web-1", containers: [{ name: "web", restartCount: 12 }, { name: "proxy" }] }],
      },
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
