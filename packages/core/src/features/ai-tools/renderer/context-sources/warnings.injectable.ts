/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { diagnosticsOf, formatDiagnostics } from "../../common/ask-ai-request";
import { aiContextSourceInjectionToken } from "../context-source";

/**
 * The warnings ProLens showed and the container states and restart counts of
 * the object's pods, as the cluster frame had them when the user asked.
 */
const warningsAiContextSourceInjectable = getInjectable({
  id: "warnings-ai-context-source",
  instantiate: () => ({
    id: "warnings",
    label: "Warnings and container status",
    description: "The warnings shown in ProLens, and the state, readiness and restart count of each container.",
    orderNumber: 5,
    isAvailableFor: (target) => Boolean(diagnosticsOf(target)),
    isEnabledByDefaultFor: () => true,
    collect: async (target) => {
      const diagnostics = diagnosticsOf(target);

      if (!diagnostics) {
        return undefined;
      }

      return { title: "Warnings and container status", body: formatDiagnostics(diagnostics) };
    },
  }),
  injectionToken: aiContextSourceInjectionToken,
});

export default warningsAiContextSourceInjectable;
