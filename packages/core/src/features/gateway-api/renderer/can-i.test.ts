/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { apiKubeInjectionToken } from "@freelensapp/kube-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDiForUnitTesting } from "../../../renderer/getDiForUnitTesting";
import gatewayApiCanIInjectable from "./can-i.injectable";

import type { DiContainer } from "@ogre-tools/injectable";

describe("gateway-api-can-i", () => {
  let di: DiContainer;
  let post: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    di = getDiForUnitTesting();
    post = vi.fn();
    di.override(apiKubeInjectionToken, () => ({ post }) as any);
  });

  const query = {
    verb: "patch",
    group: "gateway.networking.k8s.io",
    resource: "gateways",
    namespace: "default",
  } as const;

  it("asks the API server with a SelfSubjectAccessReview", async () => {
    post.mockResolvedValue({ status: { allowed: true } });

    await expect(di.inject(gatewayApiCanIInjectable)(query)).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith("/apis/authorization.k8s.io/v1/selfsubjectaccessreviews", {
      data: expect.objectContaining({ kind: "SelfSubjectAccessReview", spec: { resourceAttributes: query } }),
    });
  });

  it("reports a refusal", async () => {
    post.mockResolvedValue({ status: { allowed: false, denied: true } });

    await expect(di.inject(gatewayApiCanIInjectable)(query)).resolves.toBe(false);
  });

  it("caches answers", async () => {
    post.mockResolvedValue({ status: { allowed: true } });

    const canI = di.inject(gatewayApiCanIInjectable);

    await canI(query);
    await canI(query);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("leaves the decision to the API server when the review fails", async () => {
    post.mockRejectedValue(new Error("network"));

    await expect(di.inject(gatewayApiCanIInjectable)(query)).resolves.toBe(true);
  });
});
