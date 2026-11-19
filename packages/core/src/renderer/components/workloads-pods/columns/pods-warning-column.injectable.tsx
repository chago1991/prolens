/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { podListLayoutColumnInjectionToken } from "@freelensapp/list-layout";
import { getInjectable } from "@ogre-tools/injectable";
import { KubeObjectWarningIndicator } from "../../kube-object-warnings";
import { COLUMN_PRIORITY } from "./column-priority";

import type { Pod } from "@freelensapp/kube-object";

const columnId = "warning";

export const podsWarningColumnInjectable = getInjectable({
  id: "pods-warning-column",
  instantiate: () => ({
    id: columnId,
    kind: "Pod",
    apiVersion: "v1",
    priority: COLUMN_PRIORITY.WARNING,
    // The indicator observes the event store itself, so new events re-render this cell only.
    content: (pod: Pod) => <KubeObjectWarningIndicator object={pod} />,
    header: {
      title: <Icon material="warning_amber" />,
      className: "warning-header",
      id: columnId,
    },
  }),
  injectionToken: podListLayoutColumnInjectionToken,
});
