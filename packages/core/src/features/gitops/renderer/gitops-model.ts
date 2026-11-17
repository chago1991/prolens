/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export const argoGroup = "argoproj.io";
export const fluxKustomizeGroup = "kustomize.toolkit.fluxcd.io";
export const fluxHelmGroup = "helm.toolkit.fluxcd.io";
export const fluxSourceGroup = "source.toolkit.fluxcd.io";

/** The custom resources the GitOps view reads, by group. */
export const gitOpsKinds: Record<string, readonly string[]> = {
  [argoGroup]: ["Application", "ApplicationSet", "AppProject"],
  [fluxKustomizeGroup]: ["Kustomization"],
  [fluxHelmGroup]: ["HelmRelease"],
  [fluxSourceGroup]: ["GitRepository", "OCIRepository", "HelmRepository", "Bucket"],
};

export type GitOpsTool = "Argo CD" | "Flux";
export type SyncState = "Synced" | "OutOfSync" | "Progressing" | "Failed" | "Suspended" | "Unknown";
export type HealthState = "Healthy" | "Progressing" | "Degraded" | "Suspended" | "Missing" | "Unknown";

export interface GitOpsObject {
  readonly kind: string;
  readonly apiVersion: string;
  readonly metadata: {
    readonly name: string;
    readonly namespace?: string;
    readonly selfLink?: string;
    readonly annotations?: Partial<Record<string, string>>;
    readonly labels?: Partial<Record<string, string>>;
    readonly ownerReferences?: readonly { readonly kind: string; readonly name: string }[];
    readonly creationTimestamp?: string;
  };
  readonly spec?: unknown;
  readonly status?: unknown;
}

export interface ManagedResource {
  readonly group: string;
  readonly kind: string;
  readonly namespace?: string;
  readonly name: string;
  /** Argo CD only; Flux reports the inventory without per-object state. */
  readonly sync?: string;
  readonly health?: string;
  readonly message?: string;
}

export interface Revision {
  readonly id: string;
  readonly revision: string;
  readonly deployedAt?: string;
  readonly source?: string;
}

export interface GitOpsApp {
  readonly id: string;
  readonly tool: GitOpsTool;
  readonly kind: string;
  readonly name: string;
  readonly namespace?: string;
  readonly selfLink?: string;
  /** Where the desired state comes from, as the tool reports it. */
  readonly source: string;
  readonly path?: string;
  readonly targetRevision?: string;
  readonly revision?: string;
  readonly destination?: string;
  readonly sync: SyncState;
  readonly health: HealthState;
  readonly message?: string;
  readonly lastSync?: string;
  readonly suspended: boolean;
  readonly automated: boolean;
  /** Argo CD only: the AppProject the app belongs to. */
  readonly project?: string;
  /** Argo CD only: the ApplicationSet that generated the app. */
  readonly appSet?: string;
  readonly resources: readonly ManagedResource[];
  readonly history: readonly Revision[];
  readonly object: GitOpsObject;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const array = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const str = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

interface Condition {
  type?: string;
  status?: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

const groupOf = (apiVersion: string) => (apiVersion.includes("/") ? apiVersion.split("/")[0] : "");

const parseArgo = (object: GitOpsObject): GitOpsApp => {
  const spec = record(object.spec);
  const status = record(object.status);
  const sources = [record(spec.source), ...array<Record<string, unknown>>(spec.sources)].filter((source) =>
    str(source.repoURL),
  );
  const firstSource = sources[0] ?? {};
  const sync = record(status.sync);
  const health = record(status.health);
  const operation = record(status.operationState);
  const destination = record(spec.destination);
  const syncStatus = str(sync.status);
  const phase = str(operation.phase);
  const conditions = array<Condition>(status.conditions);

  return {
    id: `argo/${object.metadata.namespace ?? ""}/${object.metadata.name}`,
    tool: "Argo CD",
    kind: "Application",
    name: object.metadata.name,
    namespace: object.metadata.namespace,
    selfLink: object.metadata.selfLink,
    source: sources.map((source) => str(source.repoURL)).join(", ") || "—",
    path: str(firstSource.path) ?? str(firstSource.chart),
    targetRevision: str(firstSource.targetRevision) ?? "HEAD",
    revision: str(sync.revision) ?? array<string>(sync.revisions)[0],
    destination: [str(destination.server) ?? str(destination.name), str(destination.namespace)]
      .filter(Boolean)
      .join(" / "),
    sync:
      phase === "Running"
        ? "Progressing"
        : phase === "Failed" || phase === "Error"
          ? "Failed"
          : syncStatus === "Synced"
            ? "Synced"
            : syncStatus === "OutOfSync"
              ? "OutOfSync"
              : "Unknown",
    health: (["Healthy", "Progressing", "Degraded", "Suspended", "Missing"].includes(str(health.status) ?? "")
      ? str(health.status)
      : "Unknown") as HealthState,
    message:
      (phase === "Failed" || phase === "Error" ? str(operation.message) : undefined) ??
      (conditions.map((condition) => `${condition.type}: ${condition.message}`).join("; ") || undefined),
    lastSync: str(operation.finishedAt) ?? str(status.reconciledAt),
    suspended: false,
    automated: Boolean(record(spec.syncPolicy).automated),
    project: str(spec.project) ?? "default",
    appSet: object.metadata.ownerReferences?.find((owner) => owner.kind === "ApplicationSet")?.name,
    resources: array<Record<string, unknown>>(status.resources).map((resource) => ({
      group: str(resource.group) ?? "",
      kind: str(resource.kind) ?? "?",
      namespace: str(resource.namespace),
      name: str(resource.name) ?? "?",
      sync: str(resource.status),
      health: str(record(resource.health).status),
      message: str(record(resource.health).message),
    })),
    history: array<Record<string, unknown>>(status.history)
      .map((entry) => ({
        id: String(entry.id ?? ""),
        revision: str(entry.revision) ?? array<string>(entry.revisions).join(", "),
        deployedAt: str(entry.deployedAt),
        source: str(record(entry.source).repoURL),
      }))
      .reverse(),
    object,
  };
};

/** Flux inventory ids are `<namespace>_<name>_<group>_<kind>`. */
export const parseInventoryId = (id: string): ManagedResource | undefined => {
  const parts = id.split("_");

  if (parts.length < 4) return undefined;

  const kind = parts.pop() as string;
  const group = parts.pop() as string;
  const namespace = parts.shift() as string;

  return { group, kind, namespace: namespace || undefined, name: parts.join("_") };
};

const parseFlux = (object: GitOpsObject): GitOpsApp => {
  const spec = record(object.spec);
  const status = record(object.status);
  const conditions = array<Condition>(status.conditions);
  const ready = conditions.find((condition) => condition.type === "Ready");
  const reconciling = conditions.find((condition) => condition.type === "Reconciling" && condition.status === "True");
  const stalled = conditions.find((condition) => condition.type === "Stalled" && condition.status === "True");
  const suspended = spec.suspend === true;
  const sourceRef = record(spec.sourceRef ?? record(record(record(spec.chart).spec).sourceRef));
  const chart = record(record(spec.chart).spec);
  const isHelm = object.kind === "HelmRelease";
  const sync: SyncState = suspended
    ? "Suspended"
    : reconciling
      ? "Progressing"
      : ready?.status === "True"
        ? "Synced"
        : ready?.status === "False" || stalled
          ? "Failed"
          : "Unknown";

  return {
    id: `flux/${object.kind}/${object.metadata.namespace ?? ""}/${object.metadata.name}`,
    tool: "Flux",
    kind: object.kind,
    name: object.metadata.name,
    namespace: object.metadata.namespace,
    selfLink: object.metadata.selfLink,
    source: str(sourceRef.name)
      ? `${str(sourceRef.kind) ?? "Source"} ${str(sourceRef.namespace) ?? object.metadata.namespace ?? ""}/${sourceRef.name}`
      : "—",
    path: isHelm ? [str(chart.chart), str(chart.version)].filter(Boolean).join(" ") : str(spec.path),
    revision: str(status.lastAppliedRevision) ?? str(status.lastAttemptedRevision),
    destination: str(spec.targetNamespace) ?? object.metadata.namespace,
    sync,
    health: suspended
      ? "Suspended"
      : ready?.status === "True"
        ? "Healthy"
        : reconciling
          ? "Progressing"
          : ready?.status === "False"
            ? "Degraded"
            : "Unknown",
    message: ready?.status !== "True" ? (stalled?.message ?? ready?.message) : undefined,
    lastSync: ready?.lastTransitionTime,
    suspended,
    automated: !suspended,
    resources: isHelm
      ? []
      : array<{ id?: string }>(record(status.inventory).entries)
          .map((entry) => parseInventoryId(entry.id ?? ""))
          .filter((entry): entry is ManagedResource => Boolean(entry)),
    history: array<Record<string, unknown>>(status.history).map((entry, index) => ({
      id: String(entry.version ?? index),
      revision: [str(entry.chartVersion), str(entry.appVersion)].filter(Boolean).join(" / ") || "?",
      deployedAt: str(entry.lastDeployed) ?? str(entry.firstDeployed),
      source: str(entry.status),
    })),
    object,
  };
};

/** The apps of a cluster: Argo CD Applications, Flux Kustomizations and HelmReleases. */
export const toGitOpsApp = (object: GitOpsObject): GitOpsApp | undefined => {
  const group = groupOf(object.apiVersion);

  if (group === argoGroup && object.kind === "Application") return parseArgo(object);
  if (
    (group === fluxKustomizeGroup && object.kind === "Kustomization") ||
    (group === fluxHelmGroup && object.kind === "HelmRelease")
  ) {
    return parseFlux(object);
  }

  return undefined;
};

// Actions, as merge patches of the app's own resource. The controllers act on
// them; ProLens talks to no GitOps API server.

/** Argo CD: syncs to the target revision, or to `revision` (a rollback). */
export const argoSyncPatch = (
  app: GitOpsApp,
  { revision, prune = false }: { revision?: string; prune?: boolean } = {},
) => ({
  operation: {
    initiatedBy: { username: "prolens" },
    info: revision ? [{ name: "Reason", value: `Rollback to ${revision} from ProLens` }] : undefined,
    sync: { revision: revision ?? app.targetRevision, prune },
  },
});

/** Argo CD: asks the controller to compare with the repository again. */
export const argoRefreshPatch = (hard = false) => ({
  metadata: { annotations: { "argocd.argoproj.io/refresh": hard ? "hard" : "normal" } },
});

/** Flux: asks the controller to reconcile now, as `flux reconcile` does. */
export const fluxReconcilePatch = (now: Date) => ({
  metadata: { annotations: { "reconcile.fluxcd.io/requestedAt": now.toISOString() } },
});

export const fluxSuspendPatch = (suspend: boolean) => ({ spec: { suspend } });

/** Whether a rollback to an earlier revision is possible from ProLens. */
export const canRollback = (app: GitOpsApp): boolean =>
  app.tool === "Argo CD" && !app.automated && app.history.length > 1;

export interface DriftSummary {
  readonly outOfSync: readonly ManagedResource[];
  readonly unhealthy: readonly ManagedResource[];
}

/** The managed resources that differ from git, or are not healthy. */
export const driftOf = (app: GitOpsApp): DriftSummary => ({
  outOfSync: app.resources.filter((resource) => resource.sync && resource.sync !== "Synced"),
  unhealthy: app.resources.filter((resource) => resource.health && resource.health !== "Healthy"),
});

/** A link comparing two revisions on GitHub, GitLab or Bitbucket, for commit SHAs. */
export const compareUrl = (repoUrl: string | undefined, from: string, to: string): string | undefined => {
  if (!repoUrl || !/^[0-9a-f]{7,40}$/i.test(from) || !/^[0-9a-f]{7,40}$/i.test(to)) return undefined;

  const match = repoUrl.match(/^(?:https:\/\/|git@)(github\.com|gitlab\.com|bitbucket\.org)[/:](.+?)(?:\.git)?\/?$/);

  if (!match) return undefined;

  const [, host, path] = match;

  return host === "gitlab.com"
    ? `https://${host}/${path}/-/compare/${from}...${to}`
    : host === "bitbucket.org"
      ? `https://${host}/${path}/branches/compare/${to}..${from}`
      : `https://${host}/${path}/compare/${from}...${to}`;
};

// Argo CD settings: application sets, projects, repositories and clusters.

const isArgo = (object: GitOpsObject, kind: string) => groupOf(object.apiVersion) === argoGroup && object.kind === kind;

export interface GitOpsAppSet {
  readonly id: string;
  readonly name: string;
  readonly namespace?: string;
  readonly selfLink?: string;
  /** The generator kinds, such as `list`, `git` or `clusters`. */
  readonly generators: readonly string[];
  readonly project?: string;
  readonly apps: readonly GitOpsApp[];
  readonly healthy: boolean;
  readonly message?: string;
  readonly createdAt?: string;
}

/** An ApplicationSet with the apps it generated. */
export const toGitOpsAppSet = (object: GitOpsObject, apps: readonly GitOpsApp[]): GitOpsAppSet | undefined => {
  if (!isArgo(object, "ApplicationSet")) return undefined;

  const spec = record(object.spec);
  const conditions = array<Condition>(record(object.status).conditions);
  const error = conditions.find((condition) => condition.type === "ErrorOccurred" && condition.status === "True");
  const generators = array<Record<string, unknown>>(spec.generators).flatMap((generator) => Object.keys(generator));

  return {
    id: `argo-appset/${object.metadata.namespace ?? ""}/${object.metadata.name}`,
    name: object.metadata.name,
    namespace: object.metadata.namespace,
    selfLink: object.metadata.selfLink,
    generators: [...new Set(generators)],
    project: str(record(record(spec.template).spec).project),
    apps: apps.filter((app) => app.appSet === object.metadata.name && app.namespace === object.metadata.namespace),
    healthy: !error,
    message: error?.message,
    createdAt: object.metadata.creationTimestamp,
  };
};

export interface GitOpsProject {
  readonly id: string;
  readonly name: string;
  readonly namespace?: string;
  readonly selfLink?: string;
  readonly description?: string;
  readonly sourceRepos: readonly string[];
  readonly destinations: readonly string[];
  readonly apps: readonly GitOpsApp[];
}

/** An AppProject with the apps that belong to it. */
export const toGitOpsProject = (object: GitOpsObject, apps: readonly GitOpsApp[]): GitOpsProject | undefined => {
  if (!isArgo(object, "AppProject")) return undefined;

  const spec = record(object.spec);

  return {
    id: `argo-project/${object.metadata.namespace ?? ""}/${object.metadata.name}`,
    name: object.metadata.name,
    namespace: object.metadata.namespace,
    selfLink: object.metadata.selfLink,
    description: str(spec.description),
    sourceRepos: array<unknown>(spec.sourceRepos).map(String),
    destinations: array<Record<string, unknown>>(spec.destinations).map((destination) =>
      [str(destination.server) ?? str(destination.name) ?? "*", str(destination.namespace) ?? "*"].join(" / "),
    ),
    apps: apps.filter((app) => app.tool === "Argo CD" && app.project === object.metadata.name),
  };
};

/**
 * The fields of an Argo CD repository or cluster secret that ProLens shows.
 * Credentials (`password`, `sshPrivateKey`, `config`, …) are never decoded.
 */
export interface ArgoSecretFields {
  readonly name: string;
  readonly namespace?: string;
  readonly selfLink?: string;
  readonly kind: "repository" | "repo-creds" | "cluster";
  readonly url?: string;
  readonly type?: string;
  readonly project?: string;
  readonly title?: string;
  readonly server?: string;
  readonly namespaces?: string;
}

const shownSecretKeys = ["url", "type", "project", "name", "server", "namespaces"] as const;

const decode = (value: string | undefined): string | undefined => {
  if (!value) return undefined;

  try {
    return new TextDecoder().decode(Uint8Array.from(globalThis.atob(value), (char) => char.charCodeAt(0)));
  } catch {
    return undefined;
  }
};

/** Reads the non-secret fields of a secret labelled `argocd.argoproj.io/secret-type`. */
export const toArgoSecretFields = (secret: {
  readonly metadata: GitOpsObject["metadata"];
  readonly data?: Partial<Record<string, string>>;
}): ArgoSecretFields | undefined => {
  const kind = secret.metadata.labels?.["argocd.argoproj.io/secret-type"];

  if (kind !== "repository" && kind !== "repo-creds" && kind !== "cluster") return undefined;

  const fields: Partial<Record<(typeof shownSecretKeys)[number], string>> = {};

  for (const key of shownSecretKeys) fields[key] = decode(secret.data?.[key]);

  return {
    name: secret.metadata.name,
    namespace: secret.metadata.namespace,
    selfLink: secret.metadata.selfLink,
    kind,
    url: fields.url,
    type: fields.type,
    project: fields.project,
    title: fields.name,
    server: fields.server,
    namespaces: fields.namespaces,
  };
};

const normalizeRepo = (url: string) => url.replace(/\.git\/?$/, "").replace(/\/$/, "");

export interface GitOpsRepository {
  readonly url: string;
  /** git, helm or oci for Argo CD; the source kind for Flux. */
  readonly type: string;
  readonly tool: GitOpsTool;
  /** Where ProLens learnt about it: a repository secret, a Flux source, or only an app's spec. */
  readonly origin: "secret" | "credentials template" | "flux source" | "referenced";
  readonly project?: string;
  readonly name?: string;
  readonly namespace?: string;
  readonly selfLink?: string;
  readonly ready?: boolean;
  readonly message?: string;
  readonly apps: readonly GitOpsApp[];
}

export interface FluxSourceLike {
  readonly kind: string;
  readonly namespace?: string;
  readonly name: string;
  readonly ready: boolean;
  readonly message?: string;
  readonly url?: string;
  readonly selfLink?: string;
}

/** The repositories of the cluster: secrets, Flux sources, and those only referenced by Argo CD apps. */
export const repositoriesOf = ({
  secrets,
  fluxSources,
  apps,
}: {
  secrets: readonly ArgoSecretFields[];
  fluxSources: readonly FluxSourceLike[];
  apps: readonly GitOpsApp[];
}): GitOpsRepository[] => {
  const argoApps = apps.filter((app) => app.tool === "Argo CD");
  const appsOf = (url: string) =>
    argoApps.filter((app) => app.source.split(", ").some((source) => normalizeRepo(source) === normalizeRepo(url)));
  const repositories: GitOpsRepository[] = [];
  const known = new Set<string>();

  for (const secret of secrets) {
    if (secret.kind === "cluster" || !secret.url) continue;

    known.add(normalizeRepo(secret.url));
    repositories.push({
      url: secret.url,
      type: secret.type ?? "git",
      tool: "Argo CD",
      origin: secret.kind === "repo-creds" ? "credentials template" : "secret",
      project: secret.project,
      name: secret.title ?? secret.name,
      namespace: secret.namespace,
      selfLink: secret.selfLink,
      apps:
        secret.kind === "repo-creds"
          ? argoApps.filter((app) => app.source.startsWith(secret.url as string))
          : appsOf(secret.url),
    });
  }

  for (const source of fluxSources) {
    if (!source.url) continue;

    repositories.push({
      url: source.url,
      type: source.kind,
      tool: "Flux",
      origin: "flux source",
      name: source.name,
      namespace: source.namespace,
      selfLink: source.selfLink,
      ready: source.ready,
      message: source.message,
      apps: apps.filter(
        (app) => app.tool === "Flux" && app.source.endsWith(`${source.namespace ?? ""}/${source.name}`),
      ),
    });
  }

  for (const app of argoApps) {
    for (const url of app.source.split(", ")) {
      if (url === "—" || known.has(normalizeRepo(url))) continue;

      known.add(normalizeRepo(url));
      repositories.push({ url, type: "git", tool: "Argo CD", origin: "referenced", apps: appsOf(url) });
    }
  }

  return repositories.sort((a, b) => a.url.localeCompare(b.url));
};

export const inClusterServer = "https://kubernetes.default.svc";

export interface GitOpsCluster {
  readonly name: string;
  readonly server: string;
  readonly origin: "secret" | "in-cluster" | "referenced";
  readonly namespaces?: string;
  readonly project?: string;
  readonly secretName?: string;
  readonly secretNamespace?: string;
  readonly selfLink?: string;
  readonly apps: readonly GitOpsApp[];
}

/** The destination clusters of Argo CD: the in-cluster one, cluster secrets, and destinations apps name. */
export const clustersOf = ({
  secrets,
  apps,
}: {
  secrets: readonly ArgoSecretFields[];
  apps: readonly GitOpsApp[];
}): GitOpsCluster[] => {
  const argoApps = apps.filter((app) => app.tool === "Argo CD");
  const serverOf = (app: GitOpsApp) => app.destination?.split(" / ")[0];
  const clusters: GitOpsCluster[] = [];
  const seen = new Set<string>();

  const add = (cluster: Omit<GitOpsCluster, "apps">) => {
    if (seen.has(cluster.server) || seen.has(cluster.name)) return;

    seen.add(cluster.server);
    seen.add(cluster.name);
    clusters.push({
      ...cluster,
      apps: argoApps.filter((app) => serverOf(app) === cluster.server || serverOf(app) === cluster.name),
    });
  };

  for (const secret of secrets) {
    if (secret.kind !== "cluster" || !secret.server) continue;

    add({
      name: secret.title ?? secret.name,
      server: secret.server,
      origin: "secret",
      namespaces: secret.namespaces,
      project: secret.project,
      secretName: secret.name,
      secretNamespace: secret.namespace,
      selfLink: secret.selfLink,
    });
  }

  if (argoApps.length > 0 || clusters.length > 0) {
    add({ name: "in-cluster", server: inClusterServer, origin: "in-cluster" });
  }

  for (const app of argoApps) {
    const server = serverOf(app);

    if (server) add({ name: server, server, origin: "referenced" });
  }

  return clusters;
};

/** The namespaces an app lives in or deploys to, for the namespace filter. */
export const namespacesOfApp = (app: GitOpsApp): string[] =>
  [app.namespace, app.destination?.split(" / ")[1]].filter((namespace): namespace is string => Boolean(namespace));
