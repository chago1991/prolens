/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { summarizePods } from "./kube-object-warnings";

import type { KubeObject, Pod } from "@freelensapp/kube-object";

import type { AskAiRequest } from "../../../features/ai-tools/common/ask-ai-request";
import type { KubeObjectWarning } from "./kube-object-warnings";

/**
 * The Ask AI request for the warnings of an object: the object, its
 * manifest, the warnings and the container states of its pods, with the
 * "Explain this warning" question preselected.
 */
export const buildWarningAskAiRequest = (
  object: KubeObject,
  warnings: KubeObjectWarning[],
  pods: Pod[],
): AskAiRequest => ({
  presetId: "explain-warning",
  target: {
    type: "resource",
    resource: {
      kind: object.kind,
      apiVersion: object.apiVersion,
      name: object.getName(),
      namespace: object.getNs(),
      uid: object.getId(),
    },
    manifest: object.toPlainObject() as Record<string, unknown>,
    diagnostics: {
      warnings: warnings.map(({ source, reason, message, count, timestamp }) => ({
        source,
        reason,
        message,
        count,
        timestamp,
      })),
      pods: summarizePods(pods),
    },
  },
});
