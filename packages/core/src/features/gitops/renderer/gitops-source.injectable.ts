/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import apiManagerInjectable from "../../../common/k8s-api/api-manager/manager.injectable";
import customResourceDefinitionStoreInjectable from "../../../renderer/components/custom-resource-definitions/store.injectable";
import { gitOpsKinds, toGitOpsApp, toGitOpsAppSet, toGitOpsProject } from "./gitops-model";

import type { KubeObject } from "@freelensapp/kube-object";

import type { IComputedValue } from "mobx";

import type { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";
import type {
  FluxSourceLike,
  GitOpsApp,
  GitOpsAppSet,
  GitOpsObject,
  GitOpsProject,
  GitOpsTool,
  ManagedResource,
} from "./gitops-model";

type AnyStore = KubeObjectStore<KubeObject, any, any>;

export interface FluxSource extends FluxSourceLike {
  readonly revision?: string;
}

export interface GitOpsSource {
  /** Which tools have their CRDs installed. */
  readonly tools: IComputedValue<GitOpsTool[]>;
  readonly stores: IComputedValue<AnyStore[]>;
  readonly apps: IComputedValue<GitOpsApp[]>;
  readonly fluxSources: IComputedValue<FluxSource[]>;
  /** Argo CD ApplicationSets, with the apps they generated. */
  readonly appSets: IComputedValue<GitOpsAppSet[]>;
  /** Argo CD AppProjects, with their apps. */
  readonly projects: IComputedValue<GitOpsProject[]>;
  readonly loading: IComputedValue<boolean>;
  /** The store an app's resource is kept in, to patch it. */
  storeOf(app: GitOpsApp): AnyStore | undefined;
  /** The API link of a managed resource, for its details, when ProLens knows its kind. */
  linkOf(resource: ManagedResource): string | undefined;
}

const gitOpsSourceInjectable = getInjectable({
  id: "gitops-source",

  instantiate: (di): GitOpsSource => {
    const apiManager = di.inject(apiManagerInjectable);
    const crdStore = di.inject(customResourceDefinitionStoreInjectable);

    const definitions = computed(() =>
      crdStore.items.filter((crd) => gitOpsKinds[crd.getGroup()]?.includes(crd.getResourceKind())),
    );
    const stores = computed(() =>
      definitions
        .get()
        .map(
          (crd) => apiManager.getStore(crd.getResourceApiBase(crd.getPreferredVersion().name)) as AnyStore | undefined,
        )
        .filter((store): store is AnyStore => Boolean(store)),
    );
    const objects = computed(() => stores.get().flatMap((store) => store.items as unknown as GitOpsObject[]));

    const apps = computed(() =>
      objects
        .get()
        .map(toGitOpsApp)
        .filter((app): app is GitOpsApp => Boolean(app))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );

    return {
      tools: computed(() => {
        const groups = new Set(definitions.get().map((crd) => crd.getGroup()));
        const tools: GitOpsTool[] = [];

        if (groups.has("argoproj.io")) tools.push("Argo CD");
        if ([...groups].some((group) => group.endsWith("toolkit.fluxcd.io"))) tools.push("Flux");

        return tools;
      }),
      stores,
      apps,
      appSets: computed(() =>
        objects
          .get()
          .map((object) => toGitOpsAppSet(object, apps.get()))
          .filter((appSet): appSet is GitOpsAppSet => Boolean(appSet))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
      projects: computed(() =>
        objects
          .get()
          .map((object) => toGitOpsProject(object, apps.get()))
          .filter((project): project is GitOpsProject => Boolean(project))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
      fluxSources: computed(() =>
        objects
          .get()
          .filter((object) => object.apiVersion.startsWith("source.toolkit.fluxcd.io/"))
          .map((object) => {
            const status = (object.status ?? {}) as {
              artifact?: { revision?: string };
              conditions?: { type?: string; status?: string; message?: string }[];
            };
            const ready = status.conditions?.find((condition) => condition.type === "Ready");

            return {
              kind: object.kind,
              namespace: object.metadata.namespace,
              name: object.metadata.name,
              selfLink: object.metadata.selfLink,
              ready: ready?.status === "True",
              revision: status.artifact?.revision,
              message: ready?.status === "True" ? undefined : ready?.message,
              url: ((object.spec ?? {}) as { url?: string }).url,
            };
          }),
      ),
      loading: computed(() => stores.get().some((store) => !store.isLoaded && !store.failedLoading)),
      storeOf: (app) => (app.selfLink ? (apiManager.getStore(app.selfLink) as AnyStore | undefined) : undefined),
      linkOf: (resource) => {
        const api = apiManager.getApi(
          (candidate) => candidate.kind === resource.kind && candidate.apiGroup === resource.group,
        );

        return api?.formatUrlForNotListing({ name: resource.name, namespace: resource.namespace });
      },
    };
  },
});

export default gitOpsSourceInjectable;
