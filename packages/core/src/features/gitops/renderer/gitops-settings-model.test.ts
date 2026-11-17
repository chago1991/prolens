/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describe, expect, it } from "vitest";
import {
  clustersOf,
  inClusterServer,
  namespacesOfApp,
  repositoriesOf,
  toArgoSecretFields,
  toGitOpsApp,
  toGitOpsAppSet,
  toGitOpsProject,
} from "./gitops-model";

import type { GitOpsApp, GitOpsObject } from "./gitops-model";

const encode = (value: string) => btoa(value);

const app = (name: string, spec: Record<string, unknown>, ownerReferences?: { kind: string; name: string }[]) =>
  toGitOpsApp({
    kind: "Application",
    apiVersion: "argoproj.io/v1alpha1",
    metadata: { name, namespace: "argocd", ownerReferences },
    spec,
    status: { sync: { status: "Synced" }, health: { status: "Healthy" } },
  }) as GitOpsApp;

const shop = app(
  "shop",
  {
    project: "team-a",
    source: { repoURL: "https://github.com/acme/deploy.git", path: "apps/shop" },
    destination: { server: inClusterServer, namespace: "shop" },
  },
  [{ kind: "ApplicationSet", name: "storefront" }],
);
const remote = app("remote", {
  source: { repoURL: "https://github.com/acme/other" },
  destination: { server: "https://prod.example.com", namespace: "web" },
});
const apps = [shop, remote];

describe("Argo CD apps", () => {
  it("know their project, defaulting to default, and their application set", () => {
    expect(shop.project).toBe("team-a");
    expect(shop.appSet).toBe("storefront");
    expect(remote.project).toBe("default");
    expect(remote.appSet).toBeUndefined();
  });

  it("are in the namespace they live in and the one they deploy to", () => {
    expect(namespacesOfApp(shop)).toEqual(["argocd", "shop"]);
  });
});

describe("toGitOpsAppSet", () => {
  const object: GitOpsObject = {
    kind: "ApplicationSet",
    apiVersion: "argoproj.io/v1alpha1",
    metadata: { name: "storefront", namespace: "argocd" },
    spec: {
      generators: [{ list: {} }, { git: {} }, { list: {} }],
      template: { spec: { project: "team-a" } },
    },
    status: { conditions: [{ type: "ErrorOccurred", status: "True", message: "bad generator" }] },
  };

  it("reads generators, project, the apps it generated and its error", () => {
    const appSet = toGitOpsAppSet(object, apps);

    expect(appSet?.generators).toEqual(["list", "git"]);
    expect(appSet?.project).toBe("team-a");
    expect(appSet?.apps.map((generated) => generated.name)).toEqual(["shop"]);
    expect(appSet?.healthy).toBe(false);
    expect(appSet?.message).toBe("bad generator");
  });

  it("ignores other kinds", () => {
    expect(toGitOpsAppSet({ ...object, kind: "Application" }, apps)).toBeUndefined();
  });
});

describe("toGitOpsProject", () => {
  it("reads repos, destinations and the apps of the project", () => {
    const project = toGitOpsProject(
      {
        kind: "AppProject",
        apiVersion: "argoproj.io/v1alpha1",
        metadata: { name: "default", namespace: "argocd" },
        spec: { sourceRepos: ["*"], destinations: [{ server: "*", namespace: "web" }] },
      },
      apps,
    );

    expect(project?.sourceRepos).toEqual(["*"]);
    expect(project?.destinations).toEqual(["* / web"]);
    expect(project?.apps.map((member) => member.name)).toEqual(["remote"]);
  });
});

describe("toArgoSecretFields", () => {
  it("decodes the shown fields and never the credentials", () => {
    const fields = toArgoSecretFields({
      metadata: { name: "repo-1", namespace: "argocd", labels: { "argocd.argoproj.io/secret-type": "repository" } },
      data: {
        url: encode("https://github.com/acme/deploy"),
        type: encode("git"),
        password: encode("hunter2"),
        sshPrivateKey: encode("key"),
      },
    });

    expect(fields).toEqual({
      name: "repo-1",
      namespace: "argocd",
      selfLink: undefined,
      kind: "repository",
      url: "https://github.com/acme/deploy",
      type: "git",
      project: undefined,
      title: undefined,
      server: undefined,
      namespaces: undefined,
    });
    expect(JSON.stringify(fields)).not.toContain("hunter2");
  });

  it("ignores secrets without the Argo CD label", () => {
    expect(toArgoSecretFields({ metadata: { name: "other" }, data: {} })).toBeUndefined();
  });
});

describe("repositoriesOf", () => {
  it("merges secrets, Flux sources and repositories only apps reference", () => {
    const repositories = repositoriesOf({
      secrets: [
        { name: "repo-1", namespace: "argocd", kind: "repository", url: "https://github.com/acme/deploy", type: "git" },
      ],
      fluxSources: [
        { kind: "GitRepository", namespace: "flux-system", name: "infra", ready: false, url: "ssh://git@x/infra" },
      ],
      apps,
    });

    expect(repositories.map((repository) => [repository.url, repository.origin, repository.apps.length])).toEqual([
      ["https://github.com/acme/deploy", "secret", 1],
      ["https://github.com/acme/other", "referenced", 1],
      ["ssh://git@x/infra", "flux source", 0],
    ]);
  });
});

describe("clustersOf", () => {
  it("lists cluster secrets, the in-cluster one and referenced destinations once each", () => {
    const clusters = clustersOf({
      secrets: [{ name: "c-1", kind: "cluster", server: "https://prod.example.com", title: "prod" }],
      apps,
    });

    expect(
      clusters.map((cluster) => [cluster.name, cluster.origin, cluster.apps.map((member) => member.name)]),
    ).toEqual([
      ["prod", "secret", ["remote"]],
      ["in-cluster", "in-cluster", ["shop"]],
    ]);
  });

  it("is empty without Argo CD apps or secrets", () => {
    expect(clustersOf({ secrets: [], apps: [] })).toEqual([]);
  });
});
