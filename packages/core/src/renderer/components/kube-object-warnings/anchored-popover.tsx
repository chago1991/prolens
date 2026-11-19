/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./anchored-popover.module.scss";
import { computePopoverPosition } from "./popover-position";

import type { StrictReactNode } from "@freelensapp/utilities";

export interface AnchoredPopoverProps {
  id: string;
  /** The element the popover points at; focus returns to it on Escape. */
  anchor: HTMLElement;
  title: string;
  onClose: () => void;
  children: StrictReactNode;
  footer?: StrictReactNode;
  "data-testid"?: string;
}

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

/**
 * A small dialog next to an element, rendered in the document body so that
 * tables and scroll containers do not clip it. It follows the anchor while
 * the page scrolls, flips above it near the bottom of the window, and closes
 * on Escape, on a click outside, or when the anchor leaves the page.
 */
export const AnchoredPopover = ({
  id,
  anchor,
  title,
  onClose,
  children,
  footer,
  "data-testid": testId,
}: AnchoredPopoverProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  const reposition = useCallback(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    if (!anchor.isConnected) {
      onCloseRef.current();

      return;
    }

    element.style.maxHeight = "";

    const { width, height } = element.getBoundingClientRect();
    const position = computePopoverPosition(
      anchor.getBoundingClientRect(),
      { width, height },
      {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    );

    element.style.top = `${position.top}px`;
    element.style.left = `${position.left}px`;
    element.style.maxHeight = position.maxHeight === undefined ? "" : `${position.maxHeight}px`;
    element.dataset.placement = position.placement;
    element.style.visibility = "visible";
  }, [anchor]);

  useLayoutEffect(() => {
    reposition();
  });

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        anchor.focus({ preventScroll: true });
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (target && !ref.current?.contains(target) && !anchor.contains(target)) {
        onCloseRef.current();
      }
    };

    // Capture, so that a handler that stops propagation further down does not keep the popover open.
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchor, reposition]);

  const titleId = `${id}-title`;

  return createPortal(
    // React passes events of a portal to its React parents: keep them from the table row.
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={styles.popover}
      style={{ visibility: "hidden" }}
      onClick={stop}
      onDoubleClick={stop}
      onMouseDown={stop}
      onKeyDown={stop}
      onContextMenu={stop}
      data-testid={testId}
    >
      <div className={styles.header}>
        <Icon material="warning_amber" className={styles.titleIcon} focusable={false} aria-hidden="true" />
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        <button
          type="button"
          className={styles.close}
          aria-label="Close"
          onClick={() => {
            onClose();
            anchor.focus({ preventScroll: true });
          }}
          data-testid="warning-popover-close"
        >
          <Icon material="close" small focusable={false} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>,
    document.body,
  );
};
