/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { showErrorNotificationInjectable, showSuccessNotificationInjectable } from "@freelensapp/notifications";
import { getInjectable } from "@ogre-tools/injectable";
import withConfirmationInjectable from "../../../renderer/components/confirm-dialog/with-confirm.injectable";
import { argoRefreshPatch, argoSyncPatch, fluxReconcilePatch, fluxSuspendPatch } from "./gitops-model";
import gitOpsSourceInjectable from "./gitops-source.injectable";

import type { GitOpsApp } from "./gitops-model";

export type GitOpsAction =
  | { type: "sync"; prune?: boolean }
  | { type: "refresh"; hard?: boolean }
  | { type: "rollback"; revision: string; historyId: string }
  | { type: "suspend" }
  | { type: "resume" };

/** The patch an action applies to the app's own resource. */
export const patchFor = (app: GitOpsApp, action: GitOpsAction, now = new Date()): Record<string, unknown> => {
  switch (action.type) {
    case "sync":
      return app.tool === "Argo CD" ? argoSyncPatch(app, { prune: action.prune }) : fluxReconcilePatch(now);
    case "refresh":
      return app.tool === "Argo CD" ? argoRefreshPatch(action.hard) : fluxReconcilePatch(now);
    case "rollback":
      return argoSyncPatch(app, { revision: action.revision });
    case "suspend":
      return fluxSuspendPatch(true);
    case "resume":
      return fluxSuspendPatch(false);
  }
};

const describe = (app: GitOpsApp, action: GitOpsAction) => {
  switch (action.type) {
    case "sync":
      return app.tool === "Argo CD"
        ? `Sync ${app.name} to ${app.targetRevision}${action.prune ? ", pruning resources no longer in git" : ""}?`
        : `Reconcile ${app.kind} ${app.name} now?`;
    case "refresh":
      return `Compare ${app.name} with git again?`;
    case "rollback":
      return `Roll ${app.name} back to revision ${action.revision} (history ${action.historyId})? Argo CD syncs that revision until you sync again.`;
    case "suspend":
      return `Suspend ${app.kind} ${app.name}? Flux stops applying changes from git until it is resumed.`;
    case "resume":
      return `Resume ${app.kind} ${app.name}?`;
  }
};

export type RunGitOpsAction = (app: GitOpsApp, action: GitOpsAction) => void;

/** Asks for confirmation, then patches the app's resource; the controller does the rest. */
const runGitOpsActionInjectable = getInjectable({
  id: "run-gitops-action",

  instantiate: (di): RunGitOpsAction => {
    const withConfirmation = di.inject(withConfirmationInjectable);
    const source = di.inject(gitOpsSourceInjectable);
    const showError = di.inject(showErrorNotificationInjectable);
    const showSuccess = di.inject(showSuccessNotificationInjectable);

    return (app, action) => {
      const quiet = action.type === "refresh";
      const run = async () => {
        const store = source.storeOf(app);

        if (!store) {
          showError(`${app.name}: its resource is not loaded`);

          return;
        }

        try {
          await store.patch(app.object as never, patchFor(app, action) as never, "merge");

          if (!quiet) showSuccess(`${app.name}: ${action.type} requested`);
        } catch (error) {
          showError(`${app.name}: ${action.type} failed: ${String(error)}`);
        }
      };

      if (quiet) {
        void run();
      } else {
        withConfirmation({
          message: describe(app, action),
          labelOk: action.type === "rollback" ? "Roll back" : "Confirm",
          ok: run,
        })();
      }
    };
  },
});

export default runGitOpsActionInjectable;
