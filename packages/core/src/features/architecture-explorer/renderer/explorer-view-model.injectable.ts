/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import clusterSnapshotSourceInjectable from "./cluster-snapshot.injectable";
import explorerSettingsInjectable from "./explorer-settings.injectable";
import { ExplorerViewModel } from "./explorer-view-model";

/** One per cluster frame, so that search and selection survive leaving the page. */
const explorerViewModelInjectable = getInjectable({
  id: "architecture-explorer-view-model",

  instantiate: (di) =>
    new ExplorerViewModel(di.inject(clusterSnapshotSourceInjectable), di.inject(explorerSettingsInjectable)),
});

export default explorerViewModelInjectable;
