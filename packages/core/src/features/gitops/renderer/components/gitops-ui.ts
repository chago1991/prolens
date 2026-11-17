/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { cssNames } from "@freelensapp/utilities";
import styles from "./gitops-view.module.scss";

import type { GitOpsApp } from "../gitops-model";

export const needsAttention = (app: GitOpsApp) =>
  app.sync === "OutOfSync" || app.sync === "Failed" || app.health === "Degraded" || app.health === "Missing";

export const pill = (value: string) =>
  cssNames(styles.pill, {
    [styles.good]: value === "Synced" || value === "Healthy" || value === "Ready",
    [styles.drift]: value === "OutOfSync" || value === "Suspended",
    [styles.bad]: value === "Failed" || value === "Degraded" || value === "Missing" || value === "Not ready",
    [styles.busy]: value === "Progressing",
  });

export const shortRevision = (revision?: string) =>
  revision && /^[0-9a-f]{40}$/i.test(revision) ? revision.slice(0, 7) : revision;

export const since = (time?: string) => {
  if (!time) return "never";

  const minutes = Math.round((Date.now() - new Date(time).getTime()) / 60_000);

  if (Number.isNaN(minutes)) return time;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;

  return `${Math.round(minutes / 60 / 24)} d ago`;
};

/** Case-insensitive match of a search over some fields. */
export const matchesSearch = (search: string, ...fields: (string | undefined)[]) =>
  !search || fields.filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
