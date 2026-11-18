/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { cssNames } from "@freelensapp/utilities";
import { useEffect } from "react";
import styles from "./gateway-api.module.scss";

import type { StrictReactNode } from "@freelensapp/utilities";

import type { SubscribeStores } from "../../../../renderer/kube-watch-api/kube-watch-api";
import type { Condition, Health } from "../../common/model";
import type { AnyKubeObjectStore } from "../gateway-api.injectable";

const healthLabels: Record<Health, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Failing",
  unknown: "Unknown",
  missing: "Missing",
};

export const HealthBadge = ({ health, label }: { health: Health; label?: string }) => (
  <span className={cssNames(styles.badge, styles[health])} role="status">
    {label ?? healthLabels[health]}
  </span>
);

export const Section = ({
  title,
  actions,
  children,
}: {
  title: StrictReactNode;
  actions?: StrictReactNode;
  children: StrictReactNode;
}) => (
  <section className={styles.section}>
    <div className={styles.sectionTitle}>
      <span>{title}</span>
      {actions && <span>{actions}</span>}
    </div>
    {children}
  </section>
);

const conditionHealth = (condition: Condition): Health => {
  if (condition.status === "Unknown") return "unknown";

  const negative = condition.type === "Conflicted" || condition.type === "Detached";
  const ok = negative ? condition.status === "False" : condition.status === "True";

  return ok ? "healthy" : condition.type === "ResolvedRefs" || negative ? "warning" : "critical";
};

/** Every condition, failing ones first, with reason and message. */
export const ConditionsTable = ({
  conditions,
  empty = "No conditions reported.",
}: {
  conditions: readonly Condition[];
  empty?: string;
}) => {
  if (conditions.length === 0) return <div className={styles.muted}>{empty}</div>;

  const order: Health[] = ["critical", "missing", "warning", "unknown", "healthy"];
  const sorted = [...conditions].sort((a, b) => order.indexOf(conditionHealth(a)) - order.indexOf(conditionHealth(b)));

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Type</th>
          <th scope="col">Status</th>
          <th scope="col">Reason / message</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((condition) => (
          <tr key={condition.type}>
            <td>{condition.type}</td>
            <td>
              <HealthBadge health={conditionHealth(condition)} label={condition.status} />
            </td>
            <td>
              {condition.reason && <strong>{condition.reason}</strong>}
              {condition.message && <div className={styles.muted}>{condition.message}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const LinkButton = ({
  onClick,
  children,
  title,
}: {
  onClick?: () => void;
  children: StrictReactNode;
  title?: string;
}) =>
  onClick ? (
    <button type="button" className={styles.link} onClick={onClick} title={title}>
      {children}
    </button>
  ) : (
    <span title={title}>{children}</span>
  );

export const Chips = ({ values, empty = "—" }: { values: readonly string[]; empty?: string }) =>
  values.length ? (
    <>
      {values.map((value) => (
        <span key={value} className={styles.chip}>
          {value}
        </span>
      ))}
    </>
  ) : (
    <span className={styles.muted}>{empty}</span>
  );

/** Watch the stores while the component is mounted. */
export const useSubscribedStores = (
  subscribeStores: SubscribeStores,
  stores: readonly (AnyKubeObjectStore | undefined)[],
) => {
  const present = stores.filter((store): store is AnyKubeObjectStore => Boolean(store));
  const key = present.map((store) => store.api.apiBase).join(",");

  useEffect(() => subscribeStores(present, { onLoadFailure: () => undefined }), [subscribeStores, key]);
};

export const IssueList = ({ issues }: { issues: readonly { path: string; message: string }[] }) =>
  issues.length ? (
    <ul className={styles.errorList} aria-live="polite">
      {issues.map((issue) => (
        <li key={`${issue.path}:${issue.message}`}>
          <span className={styles.mono}>{issue.path}</span>: {issue.message}
        </li>
      ))}
    </ul>
  ) : null;
