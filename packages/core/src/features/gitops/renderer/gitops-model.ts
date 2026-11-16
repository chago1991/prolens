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
  [argoGroup]: ["Application"],
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
