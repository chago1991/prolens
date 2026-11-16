/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { recoverInvalidConfigFileInjectionToken } from "../common/recover-invalid-config-file";

/**
 * The renderer does not write the store files: main recovers a damaged one
 * before any window opens, so the renderer keeps failing as before.
 */
const recoverInvalidConfigFileInjectable = getInjectable({
  id: "recover-invalid-config-file",
  instantiate: () => () => false,
  injectionToken: recoverInvalidConfigFileInjectionToken,
});

export default recoverInvalidConfigFileInjectable;
