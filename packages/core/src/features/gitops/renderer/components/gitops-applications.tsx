/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { cssNames } from "@freelensapp/utilities";
import { observer } from "mobx-react";
import { useMemo, useState } from "react";
import { canRollback, compareUrl, driftOf } from "../gitops-model";
import { needsAttention, pill, shortRevision, since } from "./gitops-ui";
import styles from "./gitops-view.module.scss";

import type { ShowDetails } from "../../../../renderer/components/kube-detail-params/show-details.injectable";
import type { RunGitOpsAction } from "../gitops-actions.injectable";
import type { GitOpsApp, ManagedResource } from "../gitops-model";
import type { GitOpsSource } from "../gitops-source.injectable";

export interface AppDetailsProps {
  readonly source: GitOpsSource;
  readonly runAction: RunGitOpsAction;
  readonly showDetails: ShowDetails;
  readonly openLink: (url: string) => Promise<void>;
}

type Tab = "resources" | "drift" | "history" | "source";

const ResourceTree = ({
  app,
  onOpen,
  linkOf,
}: {
  app: GitOpsApp;
  onOpen: (link: string) => void;
  linkOf: GitOpsSource["linkOf"];
}) => {
  const byKind = useMemo(() => {
    const groups = new Map<string, ManagedResource[]>();

    for (const resource of app.resources) {
      const list = groups.get(resource.kind);

      if (list) list.push(resource);
      else groups.set(resource.kind, [resource]);
    }

    return [...groups].sort(([a], [b]) => a.localeCompare(b));
  }, [app]);

  if (!app.resources.length) {
    return (
      <p className={styles.muted}>
        {app.kind === "HelmRelease"
          ? "Flux does not list the objects of a Helm release; see its history."
          : "No managed resources reported yet."}
      </p>
    );
  }

  return (
    <ul className={styles.tree}>
      {byKind.map(([kind, resources]) => (
        <li key={kind}>
          <strong>
            {kind} <span className={styles.muted}>{resources.length}</span>
          </strong>
          <ul>
            {resources.map((resource) => {
              const link = linkOf(resource);

              return (
                <li key={`${resource.namespace}/${resource.name}`}>
                  <button type="button" className={styles.row} disabled={!link} onClick={() => link && onOpen(link)}>
                    <span>
                      {resource.namespace ? `${resource.namespace}/` : ""}
                      {resource.name}
                    </span>
                    {resource.sync && <span className={pill(resource.sync)}>{resource.sync}</span>}
                    {resource.health && <span className={pill(resource.health)}>{resource.health}</span>}
                  </button>
                  {resource.message && <small className={styles.muted}>{resource.message}</small>}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
};

export const AppDetails = observer(
  ({ app, source, runAction, showDetails, openLink }: AppDetailsProps & { app: GitOpsApp }) => {
    const [tab, setTab] = useState<Tab>("resources");
    const drift = driftOf(app);
    const fluxSource = source.fluxSources
      .get()
      .find((candidate) => app.source.endsWith(`${candidate.namespace ?? ""}/${candidate.name}`));
    const repoUrl = app.tool === "Argo CD" ? app.source.split(", ")[0] : fluxSource?.url;

    return (
      <aside className={styles.details} aria-label={`GitOps app ${app.name}`} data-testid="gitops-details">
        <header>
          <div>
            <h3>{app.name}</h3>
            <p className={styles.muted}>
              {app.tool} {app.kind} · {app.namespace}
            </p>
          </div>
          <span className={pill(app.sync)}>{app.sync}</span>
          <span className={pill(app.health)}>{app.health}</span>
        </header>

        <div className={styles.actions}>
          <button type="button" onClick={() => runAction(app, { type: "sync" })} disabled={app.suspended}>
            <Icon material="sync" smallest /> {app.tool === "Argo CD" ? "Sync" : "Reconcile"}
          </button>
          {app.tool === "Argo CD" && (
            <>
              <button type="button" onClick={() => runAction(app, { type: "sync", prune: true })}>
                <Icon material="cleaning_services" smallest /> Sync and prune
              </button>
              <button type="button" onClick={() => runAction(app, { type: "refresh" })}>
                <Icon material="refresh" smallest /> Refresh
              </button>
            </>
          )}
          {app.tool === "Flux" && (
            <button type="button" onClick={() => runAction(app, { type: app.suspended ? "resume" : "suspend" })}>
              <Icon material={app.suspended ? "play_arrow" : "pause"} smallest /> {app.suspended ? "Resume" : "Suspend"}
            </button>
          )}
          {app.selfLink && (
            <button type="button" onClick={() => showDetails(app.selfLink as string)}>
              <Icon material="open_in_new" smallest /> YAML and events
            </button>
          )}
        </div>

        {app.message && <p className={styles.error}>{app.message}</p>}

        <dl className={styles.facts}>
          <dt>Source</dt>
          <dd>{app.source}</dd>
          {app.path && (
            <>
              <dt>{app.kind === "HelmRelease" ? "Chart" : "Path"}</dt>
              <dd>{app.path}</dd>
            </>
          )}
          <dt>Revision</dt>
          <dd>
            {shortRevision(app.revision) ?? "—"}
            {app.targetRevision ? ` (target ${app.targetRevision})` : ""}
          </dd>
          <dt>Destination</dt>
          <dd>{app.destination || "—"}</dd>
          <dt>Last sync</dt>
          <dd>{since(app.lastSync)}</dd>
          <dt>Automated</dt>
          <dd>{app.automated ? "yes" : "no"}</dd>
        </dl>

        <div className={styles.tabs} role="tablist">
          {(["resources", "drift", "history", "source"] as Tab[]).map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
              {name === "drift"
                ? `Drift (${drift.outOfSync.length + drift.unhealthy.length})`
                : name[0].toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>

        <div className={styles.tabBody}>
          {tab === "resources" && <ResourceTree app={app} onOpen={showDetails} linkOf={source.linkOf} />}
          {tab === "drift" && (
            <>
              {app.tool === "Flux" ? (
                <p className={styles.muted}>
                  Flux applies with server-side apply and reports readiness, not per-object drift.
                </p>
              ) : drift.outOfSync.length + drift.unhealthy.length === 0 ? (
                <p className={styles.muted}>Every managed resource matches git and is healthy.</p>
              ) : (
                <ResourceTree
                  app={{ ...app, resources: [...new Set([...drift.outOfSync, ...drift.unhealthy])] }}
                  onOpen={showDetails}
                  linkOf={source.linkOf}
                />
              )}
            </>
          )}
          {tab === "history" && (
            <ul className={styles.history}>
              {app.history.length === 0 && <li className={styles.muted}>No history reported.</li>}
              {app.history.map((entry, index) => {
                const previous = app.history[index + 1];
                const compare = previous && compareUrl(repoUrl, previous.revision, entry.revision);

                return (
                  <li key={`${entry.id}-${entry.revision}`}>
                    <span>
                      <strong>{shortRevision(entry.revision)}</strong>{" "}
                      <span className={styles.muted}>{since(entry.deployedAt)}</span>
                      {entry.source && app.tool === "Flux" && <span className={styles.muted}> · {entry.source}</span>}
                    </span>
                    {compare && (
                      <button type="button" onClick={() => void openLink(compare)}>
                        Diff with previous
                      </button>
                    )}
                    {index > 0 && canRollback(app) && (
                      <button
                        type="button"
                        onClick={() =>
                          runAction(app, { type: "rollback", revision: entry.revision, historyId: entry.id })
                        }
                      >
                        Roll back
                      </button>
                    )}
                  </li>
                );
              })}
              {app.tool === "Argo CD" && app.automated && app.history.length > 1 && (
                <li className={styles.muted}>
                  Rollback needs automated sync off: Argo CD would sync back to git at once.
                </li>
              )}
            </ul>
          )}
          {tab === "source" && (
            <dl className={styles.facts}>
              <dt>Repository</dt>
              <dd>{repoUrl ?? app.source}</dd>
              {fluxSource && (
                <>
                  <dt>{fluxSource.kind}</dt>
                  <dd>
                    {fluxSource.ready ? "Ready" : `Not ready: ${fluxSource.message ?? "no message"}`}
                    {fluxSource.revision ? ` · ${shortRevision(fluxSource.revision.split(":").pop())}` : ""}
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      </aside>
    );
  },
);

export const AppCard = ({ app, selected, onSelect }: { app: GitOpsApp; selected: boolean; onSelect: () => void }) => (
  <button
    type="button"
    className={cssNames(styles.card, {
      [styles.selected]: selected,
      [styles.attention]: needsAttention(app),
    })}
    onClick={onSelect}
    data-testid={`gitops-app-${app.name}`}
  >
    <span className={styles.cardHead}>
      <strong>{app.name}</strong>
      <span className={styles.muted}>
        {app.tool === "Argo CD" ? "Argo CD" : `Flux ${app.kind}`} · {app.namespace}
      </span>
    </span>
    <span className={styles.pills}>
      <span className={pill(app.sync)}>{app.sync}</span>
      <span className={pill(app.health)}>{app.health}</span>
      {app.resources.length > 0 && <span className={styles.pill}>{app.resources.length} resources</span>}
    </span>
    <span className={styles.muted}>
      {app.path ?? app.source} @ {shortRevision(app.revision) ?? "—"} · {since(app.lastSync)}
    </span>
    {app.message && needsAttention(app) && <span className={styles.errorLine}>{app.message}</span>}
  </button>
);
