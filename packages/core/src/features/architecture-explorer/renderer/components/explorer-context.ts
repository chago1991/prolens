/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { createContext, useContext } from "react";

import type { ExplorerViewModel } from "../explorer-view-model";

export interface ExplorerActions {
  /** Opens the standard details drawer of a resource. */
  readonly openDetails: (selfLink: string) => void;
  readonly fitView: () => void;
  readonly centerOn: (id: string) => void;
}

export const ExplorerContext = createContext<{ vm: ExplorerViewModel; actions: ExplorerActions } | undefined>(
  undefined,
);

export const useExplorer = () => {
  const value = useContext(ExplorerContext);

  if (!value) {
    throw new Error("useExplorer() outside of the architecture explorer");
  }

  return value;
};
