/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { renameSync } from "node:fs";
import { loggerInjectionToken } from "@freelensapp/logger";
import { getInjectable } from "@ogre-tools/injectable";
import { recoverInvalidConfigFileInjectionToken } from "../common/recover-invalid-config-file";

/**
 * Main loads every store before a window opens, so it is the process that
 * recovers a damaged file. The file is kept next to the store, renamed, so
 * that nothing the user had is deleted and it can be restored by hand.
 */
const recoverInvalidConfigFileInjectable = getInjectable({
  id: "recover-invalid-config-file",
  instantiate: (di) => {
    const logger = di.inject(loggerInjectionToken);

    return (filePath) => {
      const backupPath = `${filePath}.invalid-${Date.now()}`;

      try {
        renameSync(filePath, backupPath);
      } catch (error) {
        logger.error(`[PERSISTENT-STORAGE]: ${filePath} is not valid JSON and could not be moved aside`, { error });

        return false;
      }

      logger.error(
        `[PERSISTENT-STORAGE]: ${filePath} was not valid JSON. It was moved to ${backupPath}, and the store starts from its defaults.`,
      );

      return true;
    };
  },
  injectionToken: recoverInvalidConfigFileInjectionToken,
  causesSideEffects: true,
});

export default recoverInvalidConfigFileInjectable;
