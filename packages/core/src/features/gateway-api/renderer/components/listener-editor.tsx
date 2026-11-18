/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { cssNames } from "@freelensapp/utilities";
import { useMemo } from "react";
import { listenerProtocols } from "../../common/kinds";
import { validateListeners } from "../../common/validation";
import styles from "./gateway-api.module.scss";
import { SafeApply } from "./safe-apply";
import { useDraft } from "./use-draft";

import type { Listener } from "../../common/model";
import type { ValidationIssue } from "../../common/validation";

export interface ListenerEditorProps {
  readonly objectName: string;
  readonly listeners: readonly Listener[];
  readonly allowed: boolean | undefined;
  readonly protectedTarget: boolean;
  readonly onApply: (listeners: Listener[]) => Promise<void>;
}

const hasIssue = (issues: readonly ValidationIssue[], path: string) =>
  issues.some((issue) => issue.path.startsWith(path));

const nextListenerName = (listeners: readonly Listener[]) => {
  for (let index = listeners.length + 1; ; index += 1) {
    const name = `listener-${index}`;

    if (!listeners.some((listener) => listener.name === name)) return name;
  }
};

const defaultPort: Record<string, number> = { HTTP: 80, HTTPS: 443, TLS: 443, TCP: 9000, UDP: 5353 };

/** A visual editor of the listeners of a Gateway or ListenerSet. */
export const ListenerEditor = ({ objectName, listeners, allowed, protectedTarget, onApply }: ListenerEditorProps) => {
  const source = useMemo(() => listeners.map((listener) => ({ ...listener })), [listeners]);
  const { draft, setDraft, dirty, changedInCluster, reset, apply } = useDraft<Listener[]>(source);
  const issues = useMemo(() => validateListeners(draft), [draft]);

  const update = (index: number, change: Partial<Listener>) =>
    setDraft(draft.map((listener, position) => (position === index ? { ...listener, ...change } : listener)));

  const setProtocol = (index: number, protocol: string) => {
    const listener = draft[index];
    const needsTls = protocol === "HTTPS" || protocol === "TLS";

    update(index, {
      protocol,
      port: listener.port === defaultPort[listener.protocol] ? (defaultPort[protocol] ?? listener.port) : listener.port,
      tls: needsTls ? (listener.tls ?? { mode: "Terminate", certificateRefs: [{ name: "" }] }) : undefined,
      hostname: protocol === "TCP" || protocol === "UDP" ? undefined : listener.hostname,
    });
  };

  const added = draft.filter((listener) => !listeners.some((original) => original.name === listener.name)).length;
  const removed = listeners.filter((original) => !draft.some((listener) => listener.name === original.name)).length;

  return (
    <div className={styles.editor} data-testid="gateway-api-listener-editor">
      {draft.map((listener, index) => {
        const path = `listeners[${index}]`;
        const terminates = listener.tls && (listener.tls.mode ?? "Terminate") === "Terminate";

        return (
          <fieldset key={index} className={styles.card} aria-label={`Listener ${listener.name || index + 1}`}>
            <div className={styles.editorRow}>
              <label className={cssNames(styles.field, { [styles.invalid]: hasIssue(issues, `${path}.name`) })}>
                Name
                <input value={listener.name} onChange={(event) => update(index, { name: event.target.value })} />
              </label>
              <label className={cssNames(styles.field, { [styles.invalid]: hasIssue(issues, `${path}.protocol`) })}>
                Protocol
                <select value={listener.protocol} onChange={(event) => setProtocol(index, event.target.value)}>
                  {[...new Set([...listenerProtocols, listener.protocol])].map((protocol) => (
                    <option key={protocol} value={protocol}>
                      {protocol}
                    </option>
                  ))}
                </select>
              </label>
              <label className={cssNames(styles.field, { [styles.invalid]: hasIssue(issues, `${path}.port`) })}>
                Port
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={Number.isFinite(listener.port) ? listener.port : ""}
                  onChange={(event) => update(index, { port: Number(event.target.value) })}
                />
              </label>
              <label className={cssNames(styles.field, { [styles.invalid]: hasIssue(issues, `${path}.hostname`) })}>
                Hostname
                <input
                  value={listener.hostname ?? ""}
                  placeholder="any"
                  disabled={listener.protocol === "TCP" || listener.protocol === "UDP"}
                  onChange={(event) => update(index, { hostname: event.target.value || undefined })}
                />
              </label>
              <label className={styles.field}>
                Routes from
                <select
                  value={listener.allowedRoutes?.namespaces?.from ?? "Same"}
                  onChange={(event) =>
                    update(index, {
                      allowedRoutes: {
                        ...listener.allowedRoutes,
                        namespaces: { ...listener.allowedRoutes?.namespaces, from: event.target.value },
                      },
                    })
                  }
                >
                  <option value="Same">Same namespace</option>
                  <option value="All">All namespaces</option>
                  <option value="Selector">Selector</option>
                </select>
              </label>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setDraft(draft.filter((_, position) => position !== index))}
                aria-label={`Remove listener ${listener.name}`}
              >
                Remove
              </button>
            </div>
            {listener.tls && (
              <div className={styles.editorRow}>
                <label className={styles.field}>
                  TLS mode
                  <select
                    value={listener.tls.mode ?? "Terminate"}
                    onChange={(event) => update(index, { tls: { ...listener.tls!, mode: event.target.value } })}
                  >
                    <option value="Terminate">Terminate</option>
                    {listener.protocol === "TLS" && <option value="Passthrough">Passthrough</option>}
                  </select>
                </label>
                {terminates && (
                  <label
                    className={cssNames(styles.field, {
                      [styles.invalid]: hasIssue(issues, `${path}.tls.certificateRefs`),
                    })}
                  >
                    Certificate Secret
                    <input
                      value={listener.tls.certificateRefs[0]?.name ?? ""}
                      placeholder="secret name"
                      onChange={(event) =>
                        update(index, {
                          tls: {
                            ...listener.tls!,
                            certificateRefs: [
                              { ...listener.tls!.certificateRefs[0], name: event.target.value },
                              ...listener.tls!.certificateRefs.slice(1),
                            ],
                          },
                        })
                      }
                    />
                  </label>
                )}
                {terminates && (
                  <label className={styles.field}>
                    Secret namespace
                    <input
                      value={listener.tls.certificateRefs[0]?.namespace ?? ""}
                      placeholder="same as Gateway"
                      onChange={(event) =>
                        update(index, {
                          tls: {
                            ...listener.tls!,
                            certificateRefs: [
                              {
                                ...(listener.tls!.certificateRefs[0] ?? { name: "" }),
                                namespace: event.target.value || undefined,
                              },
                              ...listener.tls!.certificateRefs.slice(1),
                            ],
                          },
                        })
                      }
                    />
                  </label>
                )}
              </div>
            )}
          </fieldset>
        );
      })}
      <div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setDraft([...draft, { name: nextListenerName(draft), protocol: "HTTP", port: 80 }])}
        >
          + Add listener
        </button>
      </div>
      <SafeApply
        objectName={objectName}
        issues={issues}
        dirty={dirty}
        allowed={allowed}
        protectedTarget={protectedTarget}
        changedInCluster={changedInCluster}
        summary={`${draft.length} listeners (${added} added, ${removed} removed). Applying replaces spec.listeners.`}
        onApply={() => apply(() => onApply(draft))}
        onReset={reset}
      />
    </div>
  );
};
