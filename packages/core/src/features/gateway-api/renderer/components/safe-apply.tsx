/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Button } from "@freelensapp/button";
import { useState } from "react";
import styles from "./gateway-api.module.scss";
import { IssueList } from "./shared";

import type { StrictReactNode } from "@freelensapp/utilities";

import type { ValidationIssue } from "../../common/validation";

export interface SafeApplyProps {
  readonly objectName: string;
  readonly issues: readonly ValidationIssue[];
  readonly dirty: boolean;
  /** `false` when RBAC refuses the change, `undefined` while unknown. */
  readonly allowed: boolean | undefined;
  readonly protectedTarget: boolean;
  /** The object changed in the cluster after the edit started. */
  readonly changedInCluster: boolean;
  readonly summary: StrictReactNode;
  readonly onApply: () => Promise<void>;
  readonly onReset: () => void;
}

/**
 * The footer of a visual editor. A change is applied only when it validates,
 * RBAC allows it, and, for a target that looks like production, the user
 * typed the name of the object.
 */
export const SafeApply = ({
  objectName,
  issues,
  dirty,
  allowed,
  protectedTarget,
  changedInCluster,
  summary,
  onApply,
  onReset,
}: SafeApplyProps) => {
  const [typed, setTyped] = useState("");
  const [waiting, setWaiting] = useState(false);
  const confirmedProtection = !protectedTarget || typed === objectName;
  const canApply = dirty && issues.length === 0 && allowed !== false && confirmedProtection && !waiting;

  return (
    <div className={styles.editor}>
      <IssueList issues={issues} />
      {allowed === false && (
        <div className={styles.notice}>Your RBAC permissions do not allow changing this object.</div>
      )}
      {changedInCluster && (
        <div className={styles.notice}>
          This object changed in the cluster while you were editing. Applying uses its previous version, and the API
          server refuses the change; reset to load the current one.
        </div>
      )}
      {dirty && <div className={styles.muted}>{summary}</div>}
      {dirty && protectedTarget && (
        <label className={styles.field}>
          This looks like a production resource. Type <strong>{objectName}</strong> to confirm.
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-label={`Type ${objectName} to confirm`}
            autoComplete="off"
          />
        </label>
      )}
      <div className={styles.actions}>
        <Button plain label="Reset" disabled={!dirty || waiting} onClick={onReset} />
        <Button
          primary
          label="Apply"
          waiting={waiting}
          disabled={!canApply}
          onClick={async () => {
            setWaiting(true);

            try {
              await onApply();
              setTyped("");
            } catch {
              // The caller reports the error; the edits stay for another try.
            } finally {
              setWaiting(false);
            }
          }}
        />
      </div>
    </div>
  );
};
