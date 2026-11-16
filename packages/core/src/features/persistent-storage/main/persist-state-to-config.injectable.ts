/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { loggerInjectionToken } from "@freelensapp/logger";
import { getInjectable } from "@ogre-tools/injectable";
import { persistStateToConfigInjectionToken } from "../common/save-to-file";

const persistStateToConfigInjectable = getInjectable({
  id: "persist-state-to-config",
  instantiate: (di) => {
    const logger = di.inject(loggerInjectionToken);

    // One write of the whole state: conf writes the file on every `set`, so a
    // `set` per key wrote it once per key and left a partly updated file
    // between the writes.
    return (config, state) => {
      logger.info(`[BASE-STORE]: saving ${config.path}...`);

      config.set(state);
    };
  },
  injectionToken: persistStateToConfigInjectionToken,
});

export default persistStateToConfigInjectable;
