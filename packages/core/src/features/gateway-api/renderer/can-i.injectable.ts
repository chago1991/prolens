/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { apiKubeInjectionToken } from "@freelensapp/kube-api";
import { loggerInjectionToken } from "@freelensapp/logger";
import { getInjectable } from "@ogre-tools/injectable";
import { useEffect, useState } from "react";

export interface AccessQuery {
  readonly verb: "create" | "update" | "patch" | "delete" | "get" | "list";
  readonly group: string;
  readonly resource: string;
  readonly namespace?: string;
  readonly name?: string;
}

export type CanI = (query: AccessQuery) => Promise<boolean>;

const cacheTtlMs = 60_000;

/**
 * Asks the API server whether the user may do something, with a
 * SelfSubjectAccessReview, so that the views offer only the actions RBAC
 * allows. The API server still decides: a refused request is reported as
 * an error, whatever this answered.
 */
const gatewayApiCanIInjectable = getInjectable({
  id: "gateway-api-can-i",
  instantiate: (di): CanI => {
    const apiKube = di.inject(apiKubeInjectionToken);
    const logger = di.inject(loggerInjectionToken);
    const cache = new Map<string, { at: number; answer: Promise<boolean> }>();

    return (query) => {
      const key = JSON.stringify(query);
      const cached = cache.get(key);

      if (cached && Date.now() - cached.at < cacheTtlMs) return cached.answer;

      const answer = (async () => {
        try {
          const review = (await apiKube.post("/apis/authorization.k8s.io/v1/selfsubjectaccessreviews", {
            data: {
              apiVersion: "authorization.k8s.io/v1",
              kind: "SelfSubjectAccessReview",
              spec: { resourceAttributes: { ...query } },
            },
          })) as { status?: { allowed?: boolean } };

          return review?.status?.allowed === true;
        } catch (error) {
          logger.warn("[GATEWAY-API]: access review failed", { query, error: String(error) });

          // Unknown: let the API server decide when the action is attempted.
          return true;
        }
      })();

      cache.set(key, { at: Date.now(), answer });

      return answer;
    };
  },
});

export default gatewayApiCanIInjectable;

/** `undefined` while the answer is pending. */
export const useCanI = (canI: CanI, query: AccessQuery | undefined) => {
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined);
  const key = JSON.stringify(query ?? null);

  useEffect(() => {
    let active = true;

    setAllowed(undefined);

    if (query) {
      void canI(query).then((answer) => {
        if (active) setAllowed(answer);
      });
    }

    return () => {
      active = false;
    };
    // The key stands for the query.
  }, [canI, key]);

  return allowed;
};
