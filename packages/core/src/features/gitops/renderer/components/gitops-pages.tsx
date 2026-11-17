/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { cssNames } from "@freelensapp/utilities";
import { AppCard } from "./gitops-applications";
import { needsAttention, pill, since } from "./gitops-ui";
import styles from "./gitops-view.module.scss";

import type { StrictReactNode } from "@freelensapp/utilities";

import type { GitOpsSection } from "../../common/gitops-route.injectable";
import type {
  GitOpsApp,
  GitOpsAppSet,
  GitOpsCluster,
  GitOpsProject,
  GitOpsRepository,
  GitOpsTool,
} from "../gitops-model";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const Empty = ({ children }: { children: StrictReactNode }) => <p className={styles.muted}>{children}</p>;

const Stat = ({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "good" | "drift" | "bad" | "busy";
  onClick?: () => void;
}) => (
  <button
    type="button"
    className={cssNames(styles.stat, tone && styles[tone])}
    onClick={onClick}
    disabled={!onClick}
    data-testid={`gitops-stat-${label}`}
  >
    <strong>{value}</strong>
    <span>{label}</span>
  </button>
);

export interface DashboardProps {
  readonly tools: readonly GitOpsTool[];
  readonly apps: readonly GitOpsApp[];
  readonly appSets: readonly GitOpsAppSet[];
  readonly projects: readonly GitOpsProject[];
  readonly repositories: readonly GitOpsRepository[];
  readonly clusters: readonly GitOpsCluster[];
  readonly onOpenSection: (section: GitOpsSection) => void;
  readonly onOpenApp: (app: GitOpsApp) => void;
}

export const GitOpsDashboard = ({
  tools,
  apps,
  appSets,
  projects,
  repositories,
  clusters,
  onOpenSection,
  onOpenApp,
}: DashboardProps) => {
  const attention = apps.filter(needsAttention);
  const recent = [...apps]
    .filter((app) => app.lastSync)
    .sort((a, b) => (b.lastSync ?? "").localeCompare(a.lastSync ?? ""))
    .slice(0, 6);
  const count = (predicate: (app: GitOpsApp) => boolean) => apps.filter(predicate).length;
  const hasArgo = tools.includes("Argo CD");

  return (
    <div className={styles.page} data-testid="gitops-dashboard">
      <div className={styles.stats}>
        <Stat label="Applications" value={apps.length} onClick={() => onOpenSection("applications")} />
        <Stat label="Synced" value={count((app) => app.sync === "Synced")} tone="good" />
        <Stat label="Out of sync" value={count((app) => app.sync === "OutOfSync")} tone="drift" />
        <Stat
          label="Failed / degraded"
          value={count((app) => app.sync === "Failed" || app.health === "Degraded")}
          tone="bad"
        />
        <Stat
          label="Progressing"
          value={count((app) => app.sync === "Progressing" || app.health === "Progressing")}
          tone="busy"
        />
        <Stat label="Suspended" value={count((app) => app.suspended)} />
      </div>

      <div className={styles.stats}>
        {hasArgo && (
          <Stat label="Application sets" value={appSets.length} onClick={() => onOpenSection("applicationsets")} />
        )}
        {hasArgo && <Stat label="Projects" value={projects.length} onClick={() => onOpenSection("projects")} />}
        <Stat label="Repositories" value={repositories.length} onClick={() => onOpenSection("repositories")} />
        {hasArgo && <Stat label="Clusters" value={clusters.length} onClick={() => onOpenSection("clusters")} />}
      </div>

      <section className={styles.section}>
        <h3>
          <Icon material="warning" smallest /> Needs attention <span className={styles.muted}>{attention.length}</span>
        </h3>
        {attention.length === 0 ? (
          <Empty>Every app is synced and healthy.</Empty>
        ) : (
          <div className={styles.grid}>
            {attention.map((app) => (
              <AppCard key={app.id} app={app} selected={false} onSelect={() => onOpenApp(app)} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h3>
          <Icon material="history" smallest /> Recently synced
        </h3>
        {recent.length === 0 ? (
          <Empty>No sync reported yet.</Empty>
        ) : (
          <ul className={styles.list}>
            {recent.map((app) => (
              <li key={app.id}>
                <button type="button" className={styles.row} onClick={() => onOpenApp(app)}>
                  <span>
                    <strong>{app.name}</strong> <span className={styles.muted}>{app.namespace}</span>
                  </span>
                  <span className={pill(app.sync)}>{app.sync}</span>
                  <span className={pill(app.health)}>{app.health}</span>
                  <span className={styles.muted}>{since(app.lastSync)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

const Card = ({
  title,
  subtitle,
  pills,
  facts,
  message,
  onOpen,
  testId,
}: {
  title: string;
  subtitle?: string;
  pills?: StrictReactNode;
  facts: [string, StrictReactNode][];
  message?: string;
  onOpen?: () => void;
  testId: string;
}) => (
  <div
    className={cssNames(styles.card, styles.staticCard, { [styles.attention]: Boolean(message) })}
    data-testid={testId}
  >
    <span className={styles.cardHead}>
      <strong>{title}</strong>
      {subtitle && <span className={styles.muted}>{subtitle}</span>}
    </span>
    {pills && <span className={styles.pills}>{pills}</span>}
    <dl className={styles.facts}>
      {facts.map(([term, value]) => (
        <div key={term} className={styles.factRow}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
    {message && <span className={styles.errorLine}>{message}</span>}
    {onOpen && (
      <div className={styles.actions}>
        <button type="button" onClick={onOpen}>
          <Icon material="open_in_new" smallest /> YAML and events
        </button>
      </div>
    )}
  </div>
);

const AppLinks = ({ apps, onOpenApp }: { apps: readonly GitOpsApp[]; onOpenApp: (app: GitOpsApp) => void }) =>
  apps.length === 0 ? (
    <span className={styles.muted}>none</span>
  ) : (
    <span className={styles.links}>
      {apps.map((app) => (
        <button key={app.id} type="button" onClick={() => onOpenApp(app)} title={`${app.sync} · ${app.health}`}>
          {app.name}
        </button>
      ))}
    </span>
  );

interface ListProps<T> {
  readonly items: readonly T[];
  readonly onOpenApp: (app: GitOpsApp) => void;
  readonly showDetails: (selfLink: string) => void;
}

export const GitOpsAppSets = ({ items, onOpenApp, showDetails }: ListProps<GitOpsAppSet>) =>
  items.length === 0 ? (
    <Empty>No ApplicationSet matches.</Empty>
  ) : (
    <div className={styles.grid}>
      {items.map((appSet) => (
        <Card
          key={appSet.id}
          testId={`gitops-appset-${appSet.name}`}
          title={appSet.name}
          subtitle={`ApplicationSet · ${appSet.namespace ?? ""}`}
          pills={
            <>
              <span className={pill(appSet.healthy ? "Healthy" : "Degraded")}>
                {appSet.healthy ? "Healthy" : "Error"}
              </span>
              <span className={styles.pill}>{plural(appSet.apps.length, "app")}</span>
            </>
          }
          facts={[
            ["Generators", appSet.generators.join(", ") || "—"],
            ["Project", appSet.project ?? "—"],
            ["Apps", <AppLinks key="apps" apps={appSet.apps} onOpenApp={onOpenApp} />],
            ["Created", since(appSet.createdAt)],
          ]}
          message={appSet.message}
          onOpen={appSet.selfLink ? () => showDetails(appSet.selfLink as string) : undefined}
        />
      ))}
    </div>
  );

export const GitOpsProjects = ({ items, onOpenApp, showDetails }: ListProps<GitOpsProject>) =>
  items.length === 0 ? (
    <Empty>No AppProject matches.</Empty>
  ) : (
    <div className={styles.grid}>
      {items.map((project) => (
        <Card
          key={project.id}
          testId={`gitops-project-${project.name}`}
          title={project.name}
          subtitle={project.description ?? `AppProject · ${project.namespace ?? ""}`}
          pills={
            <>
              <span className={styles.pill}>{plural(project.apps.length, "app")}</span>
              {project.apps.some(needsAttention) && (
                <span className={pill("OutOfSync")}>{project.apps.filter(needsAttention).length} need attention</span>
              )}
            </>
          }
          facts={[
            ["Source repos", project.sourceRepos.join(", ") || "—"],
            ["Destinations", project.destinations.join(", ") || "—"],
            ["Apps", <AppLinks key="apps" apps={project.apps} onOpenApp={onOpenApp} />],
          ]}
          onOpen={project.selfLink ? () => showDetails(project.selfLink as string) : undefined}
        />
      ))}
    </div>
  );

export const GitOpsRepositories = ({
  items,
  onOpenApp,
  showDetails,
  secretsError,
}: ListProps<GitOpsRepository> & { secretsError?: string }) => (
  <>
    {secretsError && (
      <p className={styles.notice}>
        <Icon material="info" smallest /> Argo CD repository secrets could not be listed ({secretsError}); showing the
        repositories apps reference.
      </p>
    )}
    {items.length === 0 ? (
      <Empty>No repository matches.</Empty>
    ) : (
      <div className={styles.grid}>
        {items.map((repository) => (
          <Card
            key={`${repository.tool}/${repository.origin}/${repository.namespace ?? ""}/${repository.name ?? ""}/${repository.url}`}
            testId={`gitops-repository-${repository.url}`}
            title={repository.url}
            subtitle={`${repository.tool} · ${repository.type}${repository.name ? ` · ${repository.name}` : ""}`}
            pills={
              <>
                {repository.ready !== undefined && (
                  <span className={pill(repository.ready ? "Ready" : "Not ready")}>
                    {repository.ready ? "Ready" : "Not ready"}
                  </span>
                )}
                <span className={styles.pill}>{repository.origin}</span>
                <span className={styles.pill}>{plural(repository.apps.length, "app")}</span>
              </>
            }
            facts={[
              ["Project", repository.project ?? "—"],
              ["Namespace", repository.namespace ?? "—"],
              ["Apps", <AppLinks key="apps" apps={repository.apps} onOpenApp={onOpenApp} />],
            ]}
            message={repository.ready === false ? repository.message : undefined}
            onOpen={repository.selfLink ? () => showDetails(repository.selfLink as string) : undefined}
          />
        ))}
      </div>
    )}
  </>
);

export const GitOpsClusters = ({
  items,
  onOpenApp,
  showDetails,
  secretsError,
}: ListProps<GitOpsCluster> & { secretsError?: string }) => (
  <>
    {secretsError && (
      <p className={styles.notice}>
        <Icon material="info" smallest /> Argo CD cluster secrets could not be listed ({secretsError}); showing the
        destinations apps reference.
      </p>
    )}
    {items.length === 0 ? (
      <Empty>No cluster matches.</Empty>
    ) : (
      <div className={styles.grid}>
        {items.map((cluster) => (
          <Card
            key={cluster.server}
            testId={`gitops-cluster-${cluster.name}`}
            title={cluster.name}
            subtitle={cluster.server}
            pills={
              <>
                <span className={styles.pill}>{cluster.origin}</span>
                <span className={styles.pill}>{plural(cluster.apps.length, "app")}</span>
                {cluster.apps.some(needsAttention) && (
                  <span className={pill("OutOfSync")}>{cluster.apps.filter(needsAttention).length} need attention</span>
                )}
              </>
            }
            facts={[
              ["Namespaces", cluster.namespaces || "all"],
              ["Project", cluster.project ?? "—"],
              ["Apps", <AppLinks key="apps" apps={cluster.apps} onOpenApp={onOpenApp} />],
            ]}
            onOpen={cluster.selfLink ? () => showDetails(cluster.selfLink as string) : undefined}
          />
        ))}
      </div>
    )}
  </>
);
