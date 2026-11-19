/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface PopoverPosition {
  top: number;
  left: number;
  placement: "bottom" | "top";
  /** Set when the popover is taller than the room on either side. */
  maxHeight?: number;
}

/**
 * Where a popover anchored to `anchor` goes: below it, or above when it does
 * not fit below, aligned with the anchor's left edge and kept `margin` pixels
 * inside the viewport.
 */
export const computePopoverPosition = (
  anchor: AnchorRect,
  popover: Size,
  viewport: Size,
  gap = 6,
  margin = 8,
): PopoverPosition => {
  const below = viewport.height - anchor.bottom - gap - margin;
  const above = anchor.top - gap - margin;
  const placement = popover.height <= below || below >= above ? "bottom" : "top";
  const room = placement === "bottom" ? below : above;
  const height = Math.min(popover.height, Math.max(room, 0));
  const top = placement === "bottom" ? anchor.bottom + gap : anchor.top - gap - height;
  const maxLeft = viewport.width - popover.width - margin;
  const left = Math.max(margin, Math.min(anchor.left - 8, maxLeft));

  return {
    top: Math.max(margin, top),
    left,
    placement,
    maxHeight: popover.height > room ? Math.max(room, 0) : undefined,
  };
};
