/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import openLinkInBrowserInjectable from "../../../../common/utils/open-link-in-browser.injectable";
import showDetailsInjectable from "../../../../renderer/components/kube-detail-params/show-details.injectable";
import subscribeStoresInjectable from "../../../../renderer/kube-watch-api/subscribe-stores.injectable";
import routePathParametersInjectable from "../../../../renderer/routes/route-path-parameters.injectable";
import gitOpsRouteInjectable, { gitOpsSections } from "../../common/gitops-route.injectable";
import navigateToGitOpsInjectable from "../../common/navigate-to-gitops.injectable";
import loadArgoSecretsInjectable from "../argo-secrets.injectable";
import runGitOpsActionInjectable from "../gitops-actions.injectable";
import { clustersOf, namespacesOfApp, repositoriesOf } from "../gitops-model";
import gitOpsSourceInjectable from "../gitops-source.injectable";
import { AppCard, AppDetails } from "./gitops-applications";
import { GitOpsAppSets, GitOpsClusters, GitOpsDashboard, GitOpsProjects, GitOpsRepositories } from "./gitops-pages";
import { matchesSearch, needsAttention } from "./gitops-ui";
import styles from "./gitops-view.module.scss";

import type { IComputedValue } from "mobx";

import type { ShowDetails } from "../../../../renderer/components/kube-detail-params/show-details.injectable";
import type { SubscribeStores } from "../../../../renderer/kube-watch-api/kube-watch-api";
import type { GitOpsSection } from "../../common/gitops-route.injectable";
import type { NavigateToGitOps } from "../../common/navigate-to-gitops.injectable";
import type { LoadArgoSecrets } from "../argo-secrets.injectable";
import type { RunGitOpsAction } from "../gitops-actions.injectable";
import type { ArgoSecretFields, GitOpsApp } from "../gitops-model";
import type { GitOpsSource } from "../gitops-source.injectable";

interface Dependencies {
  readonly source: GitOpsSource;
  readonly subscribeStores: SubscribeStores;
  readonly runAction: RunGitOpsAction;
  readonly showDetails: ShowDetails;
  readonly openLink: (url: string) => Promise<void>;
  readonly pathParameters: IComputedValue<Record<string, string>>;
  readonly navigateToGitOps: NavigateToGitOps;
  readonly loadArgoSecrets: LoadArgoSecrets;
}

type Filter = "all" | "attention" | "outOfSync" | "suspended";

const titles: Record<GitOpsSection | "dashboard", string> = {
  dashboard: "Dashboard",
  applications: "Applications",
  applicationsets: "Application Sets",
  projects: "Projects",
  repositories: "Repositories",
  clusters: "Clusters",
};

const toSection = (value: string | undefined): GitOpsSection | undefined =>
  gitOpsSections.find((section) => section === value);

const inNamespace = (namespace: string, ...candidates: (string | undefined)[]) =>
  !namespace || candidates.includes(namespace);

const NonInjectedGitOpsView = observer((props: Dependencies) => {
  const { source, subscribeStores, pathParameters, navigateToGitOps, loadArgoSecrets, showDetails } = props;
  const section = toSection(pathParameters.get().section);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [namespace, setNamespace] = useState("");
  const [selected, setSelected] = useState<string>();
  const [secrets, setSecrets] = useState<ArgoSecretFields[]>([]);
  const [secretsError, setSecretsError] = useState<string>();
  const stores = source.stores.get();
  const tools = source.tools.get();
  const hasArgo = tools.includes("Argo CD");

  useEffect(() => subscribeStores(stores, { onLoadFailure: () => undefined }), [stores, subscribeStores]);

  // Repository and cluster secrets are listed once per visit of the view, not watched.
  useEffect(() => {
    if (!hasArgo) return;

    let cancelled = false;

    loadArgoSecrets().then(
      (loaded) => {
        if (cancelled) return;
        setSecrets(loaded);
        setSecretsError(undefined);
      },
      (error: unknown) => {
        if (cancelled) return;
        setSecrets([]);
        setSecretsError(error instanceof Error ? error.message : String(error));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [hasArgo, loadArgoSecrets]);

  const apps = source.apps.get();
  const appSets = source.appSets.get();
  const projects = source.projects.get();
  const fluxSources = source.fluxSources.get();
  const repositories = repositoriesOf({ secrets, fluxSources, apps });
  const clusters = clustersOf({ secrets, apps });

  const namespaces = [
    ...new Set([
      ...apps.flatMap(namespacesOfApp),
      ...appSets.map((appSet) => appSet.namespace),
      ...projects.map((project) => project.namespace),
      ...repositories.map((repository) => repository.namespace),
    ]),
  ]
    .filter((value): value is string => Boolean(value))
    .sort();

  const appsInNamespace = apps.filter((app) => inNamespace(namespace, ...namespacesOfApp(app)));
  const visibleApps = appsInNamespace.filter((app) => {
    if (filter === "attention" && !needsAttention(app)) return false;
    if (filter === "outOfSync" && app.sync !== "OutOfSync") return false;
    if (filter === "suspended" && !app.suspended) return false;

    return matchesSearch(search, app.name, app.namespace, app.source, app.path, app.project);
  });
  const selectedApp = apps.find((app) => app.id === selected);
  const counts = {
    all: appsInNamespace.length,
    attention: appsInNamespace.filter(needsAttention).length,
    outOfSync: appsInNamespace.filter((app) => app.sync === "OutOfSync").length,
    suspended: appsInNamespace.filter((app) => app.suspended).length,
  };

  const openApp = (app: GitOpsApp) => {
    setSelected(app.id);
    if (section !== "applications") navigateToGitOps("applications");
  };
  const listProps = { onOpenApp: openApp, showDetails: (selfLink: string) => showDetails(selfLink) };

  const renderSection = () => {
    switch (section) {
      case undefined:
        return (
          <GitOpsDashboard
            tools={tools}
            apps={appsInNamespace.filter((app) => matchesSearch(search, app.name, app.namespace, app.source))}
            appSets={appSets.filter((appSet) => inNamespace(namespace, appSet.namespace))}
            projects={projects}
            repositories={repositories}
            clusters={clusters}
            onOpenSection={navigateToGitOps}
            onOpenApp={openApp}
          />
        );
      case "applications":
        return (
          <div className={styles.body}>
            <div className={styles.grid}>
              {source.loading.get() && apps.length === 0 && <p className={styles.muted}>Loading…</p>}
              {!source.loading.get() && visibleApps.length === 0 && <p className={styles.muted}>No app matches.</p>}
              {visibleApps.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  selected={app.id === selected}
                  onSelect={() => setSelected(app.id === selected ? undefined : app.id)}
                />
              ))}
            </div>
            {selectedApp && <AppDetails app={selectedApp} {...props} />}
          </div>
        );
      case "applicationsets":
        return (
          <div className={styles.page}>
            <GitOpsAppSets
              {...listProps}
              items={appSets.filter(
                (appSet) =>
                  inNamespace(namespace, appSet.namespace) &&
                  matchesSearch(search, appSet.name, appSet.project, ...appSet.generators),
              )}
            />
          </div>
        );
      case "projects":
        return (
          <div className={styles.page}>
            <GitOpsProjects
              {...listProps}
              items={projects.filter(
                (project) =>
                  (inNamespace(namespace, project.namespace) ||
                    project.apps.some((app) => inNamespace(namespace, ...namespacesOfApp(app)))) &&
                  matchesSearch(search, project.name, project.description, ...project.sourceRepos),
              )}
            />
          </div>
        );
      case "repositories":
        return (
          <div className={styles.page}>
            <GitOpsRepositories
              {...listProps}
              secretsError={hasArgo ? secretsError : undefined}
              items={repositories.filter(
                (repository) =>
                  (inNamespace(namespace, repository.namespace) ||
                    repository.apps.some((app) => inNamespace(namespace, ...namespacesOfApp(app)))) &&
                  matchesSearch(search, repository.url, repository.name, repository.type, repository.project),
              )}
            />
          </div>
        );
      case "clusters":
        return (
          <div className={styles.page}>
            <GitOpsClusters
              {...listProps}
              secretsError={secretsError}
              items={clusters.filter(
                (cluster) =>
                  (!namespace || cluster.apps.some((app) => inNamespace(namespace, ...namespacesOfApp(app)))) &&
                  matchesSearch(search, cluster.name, cluster.server, cluster.project),
              )}
            />
          </div>
        );
    }
  };

  return (
    <div className={styles.view} data-testid="gitops-view">
      <div className={styles.toolbar}>
        <h2>
          <Icon material="merge_type" /> GitOps <span className={styles.crumb}>/ {titles[section ?? "dashboard"]}</span>
        </h2>
        <select
          className={styles.namespace}
          value={namespace}
          onChange={(event) => setNamespace(event.target.value)}
          aria-label="Namespace"
          data-testid="gitops-namespace"
        >
          <option value="">All namespaces</option>
          {namespaces.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          className={styles.search}
          type="search"
          placeholder={`Search ${titles[section ?? "applications"].toLowerCase()}…`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search"
        />
        <span className={styles.spacer} />
        {section === "applications" && (
          <div className={styles.segmented} role="group" aria-label="Filter">
            {(
              [
                ["all", "All"],
                ["attention", "Needs attention"],
                ["outOfSync", "Out of sync"],
                ["suspended", "Suspended"],
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label} <span className={styles.muted}>{counts[value]}</span>
              </button>
            ))}
          </div>
        )}
        {tools.map((tool) => (
          <span key={tool} className={styles.tool}>
            {tool}
          </span>
        ))}
      </div>

      {tools.length === 0 ? (
        <div className={styles.body}>
          <div className={styles.empty}>
            <h3>No GitOps controller found</h3>
            <p>
              ProLens shows Argo CD Applications and Flux Kustomizations and HelmReleases when their CRDs are installed
              and you may list them.
            </p>
          </div>
        </div>
      ) : (
        renderSection()
      )}
    </div>
  );
});

export const GitOpsView = withInjectables<Dependencies>(NonInjectedGitOpsView, {
  getProps: (di, props) => ({
    ...props,
    source: di.inject(gitOpsSourceInjectable),
    subscribeStores: di.inject(subscribeStoresInjectable),
    runAction: di.inject(runGitOpsActionInjectable),
    showDetails: di.inject(showDetailsInjectable),
    openLink: di.inject(openLinkInBrowserInjectable),
    pathParameters: di.inject(routePathParametersInjectable, di.inject(gitOpsRouteInjectable)),
    navigateToGitOps: di.inject(navigateToGitOpsInjectable),
    loadArgoSecrets: di.inject(loadArgoSecretsInjectable),
  }),
});
