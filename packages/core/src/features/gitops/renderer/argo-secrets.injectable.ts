/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { secretApiInjectable } from "@freelensapp/kube-api-specifics";
import { getInjectable } from "@ogre-tools/injectable";
import { toArgoSecretFields } from "./gitops-model";

import type { ArgoSecretFields } from "./gitops-model";

export type LoadArgoSecrets = () => Promise<ArgoSecretFields[]>;

/**
 * Lists the Argo CD repository and cluster secrets of every namespace, by
 * their label. Only their non-secret fields are decoded; a user who may not
 * list secrets gets an error, and the pages fall back to what apps reference.
 */
const loadArgoSecretsInjectable = getInjectable({
  id: "gitops-load-argo-secrets",

  instantiate: (di): LoadArgoSecrets => {
    const secretApi = di.inject(secretApiInjectable);

    return async () => {
      const secrets = await secretApi.list(
        {},
        { labelSelector: "argocd.argoproj.io/secret-type in (repository,repo-creds,cluster)" },
      );

      return (secrets ?? [])
        .map((secret) => toArgoSecretFields(secret))
        .filter((fields): fields is ArgoSecretFields => Boolean(fields));
    };
  },
});

export default loadArgoSecretsInjectable;
