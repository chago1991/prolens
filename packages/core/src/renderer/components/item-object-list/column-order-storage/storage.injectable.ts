/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import createStorageInjectable from "../../../utils/create-storage/create-storage.injectable";

/** The column order a user chose, by table id. */
export interface ColumnOrderStorageState {
  [tableId: string]: string[];
}

const columnOrderStorageInjectable = getInjectable({
  id: "column-order-storage",

  instantiate: (di) => {
    const createStorage = di.inject(createStorageInjectable);

    return createStorage<ColumnOrderStorageState>("column-orders", {});
  },
});

export default columnOrderStorageInjectable;
