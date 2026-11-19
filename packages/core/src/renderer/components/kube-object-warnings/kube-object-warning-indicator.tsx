/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observer } from "mobx-react";
import { useId, useState } from "react";
import { AskAiButton } from "../../../features/ai-tools/renderer/ask-ai-button";
import { ReactiveDuration } from "../duration";
import eventStoreInjectable from "../events/store.injectable";
import { AnchoredPopover } from "./anchored-popover";
import { buildWarningAskAiRequest } from "./build-warning-ask-ai-request";
import getRelatedPodsInjectable from "./get-related-pods.injectable";
import styles from "./kube-object-warning-indicator.module.scss";
import { getKubeObjectWarnings } from "./kube-object-warnings";

import type { KubeObject } from "@freelensapp/kube-object";

import type { EventStore } from "../events/store";
import type { GetRelatedPods } from "./get-related-pods.injectable";
import type { KubeObjectWarning } from "./kube-object-warnings";

export interface KubeObjectWarningIndicatorProps {
  object: KubeObject;
}

interface Dependencies {
  eventStore: EventStore;
  getRelatedPods: GetRelatedPods;
}

const WarningItem = ({ warning }: { warning: KubeObjectWarning }) => (
  <li className={styles.item} data-testid="kube-object-warning">
    <div className={styles.itemHeader}>
      <span className={styles.reason}>{warning.reason}</span>
      {warning.count !== undefined && warning.count > 1 && (
        <span className={styles.meta} title={`Seen ${warning.count} times`}>
          ×{warning.count}
        </span>
      )}
      {warning.timestamp && (
        <span className={styles.meta}>
          <ReactiveDuration timestamp={warning.timestamp} /> ago
        </span>
      )}
    </div>
    {warning.message && <p className={styles.message}>{warning.message}</p>}
  </li>
);

/**
 * The warning icon of a table row. A click opens a popover with the
 * object's warnings and an "Ask AI" button. Renders nothing without warnings.
 *
 * Reads the event store, which the list views already load, so it makes no
 * request of its own; as an observer, only this cell re-renders on new events.
 */
const NonInjectedKubeObjectWarningIndicator = observer(
  ({ object, eventStore, getRelatedPods }: KubeObjectWarningIndicatorProps & Dependencies) => {
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const popoverId = `kube-object-warnings-${useId().replace(/:/g, "")}`;
    const warnings = getKubeObjectWarnings(object, eventStore.getEventsByObject(object));

    if (!warnings.length) {
      return null;
    }

    const [latest] = warnings;
    const label = `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"} for ${object.kind} ${object.getName()}`;
    const close = () => setOpen(false);

    return (
      <>
        <button
          ref={setAnchor}
          type="button"
          className={styles.indicator}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          title={`${latest.reason}: ${latest.message}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          data-testid="kube-object-warning-indicator"
        >
          <Icon material="warning_amber" small focusable={false} />
          {warnings.length > 1 && <span className={styles.count}>{warnings.length}</span>}
        </button>
        {open && anchor && (
          <AnchoredPopover
            id={popoverId}
            anchor={anchor}
            title={warnings.length === 1 ? "Warning" : `Warnings (${warnings.length})`}
            onClose={close}
            data-testid="kube-object-warning-popover"
            footer={
              <AskAiButton
                getRequest={() => buildWarningAskAiRequest(object, warnings, getRelatedPods(object))}
                onAsked={close}
                data-testid="kube-object-warning-ask-ai"
              />
            }
          >
            <ul className={styles.list}>
              {warnings.map((warning) => (
                <WarningItem key={warning.id} warning={warning} />
              ))}
            </ul>
          </AnchoredPopover>
        )}
      </>
    );
  },
);

export const KubeObjectWarningIndicator = withInjectables<Dependencies, KubeObjectWarningIndicatorProps>(
  NonInjectedKubeObjectWarningIndicator,
  {
    getProps: (di, props) => ({
      ...props,
      eventStore: di.inject(eventStoreInjectable),
      getRelatedPods: di.inject(getRelatedPodsInjectable),
    }),
  },
);
