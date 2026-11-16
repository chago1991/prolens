/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectionToken } from "@ogre-tools/injectable";

/**
 * Called with the path of a store file that is not valid JSON, for example one
 * cut short by a crash or a full disk. Returns true when the file was moved
 * out of the way, so that the store can start again from its defaults, and
 * false when the store must fail as before.
 */
export type RecoverInvalidConfigFile = (filePath: string) => boolean;

export const recoverInvalidConfigFileInjectionToken = getInjectionToken<RecoverInvalidConfigFile>({
  id: "recover-invalid-config-file-token",
});
