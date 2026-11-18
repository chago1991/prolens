/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SafeApply } from "./safe-apply";

import type { SafeApplyProps } from "./safe-apply";

const props = (overrides: Partial<SafeApplyProps> = {}): SafeApplyProps => ({
  objectName: "web",
  issues: [],
  dirty: true,
  allowed: true,
  protectedTarget: false,
  changedInCluster: false,
  summary: "summary",
  onApply: vi.fn().mockResolvedValue(undefined),
  onReset: vi.fn(),
  ...overrides,
});

const apply = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].find((button) => button.textContent === "Apply") as HTMLButtonElement;

describe("SafeApply", () => {
  it("applies a valid change", () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<SafeApply {...props({ onApply })} />);

    fireEvent.click(apply(container));
    expect(onApply).toHaveBeenCalled();
  });

  it("refuses a change RBAC does not allow", () => {
    const { container, getByText } = render(<SafeApply {...props({ allowed: false })} />);

    expect(apply(container)).toBeDisabled();
    expect(getByText(/RBAC permissions do not allow/)).toBeInTheDocument();
  });

  it("refuses an invalid change", () => {
    const { container, getByText } = render(
      <SafeApply
        {...props({ issues: [{ path: "listeners[0].port", message: "Port must be between 1 and 65535." }] })}
      />,
    );

    expect(apply(container)).toBeDisabled();
    expect(getByText(/Port must be between/)).toBeInTheDocument();
  });

  it("requires the name to be typed for production targets", () => {
    const { container, getByLabelText } = render(<SafeApply {...props({ protectedTarget: true })} />);

    expect(apply(container)).toBeDisabled();
    fireEvent.change(getByLabelText("Type web to confirm"), { target: { value: "wrong" } });
    expect(apply(container)).toBeDisabled();
    fireEvent.change(getByLabelText("Type web to confirm"), { target: { value: "web" } });
    expect(apply(container)).not.toBeDisabled();
  });

  it("warns when the object changed in the cluster during the edit", () => {
    const { getByText } = render(<SafeApply {...props({ changedInCluster: true })} />);

    expect(getByText(/changed in the cluster while you were editing/)).toBeInTheDocument();
  });

  it("has nothing to apply without changes", () => {
    const { container } = render(<SafeApply {...props({ dirty: false })} />);

    expect(apply(container)).toBeDisabled();
  });
});
