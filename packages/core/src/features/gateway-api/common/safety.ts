/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const productionPattern = /(^|[^a-z0-9])(prod|production|prd|live)([^a-z0-9]|$)/i;
const environmentLabels = ["environment", "env", "tier", "stage", "app.kubernetes.io/environment"];

export interface ProtectionInput {
  readonly clusterName?: string;
  readonly namespace?: string;
  readonly labels?: Readonly<Partial<Record<string, string>>>;
  readonly namespaceLabels?: Readonly<Partial<Record<string, string>>>;
}

/**
 * Whether a change looks like it targets production: the cluster or namespace
 * is named like it, or the object or namespace carries a production
 * environment label. Such changes need the name typed to confirm them.
 */
export const looksLikeProduction = ({ clusterName, namespace, labels, namespaceLabels }: ProtectionInput) => {
  if (clusterName && productionPattern.test(clusterName)) return true;
  if (namespace && productionPattern.test(namespace)) return true;

  return [labels, namespaceLabels].some((source) =>
    environmentLabels.some((label) => {
      const value = source?.[label];

      return value !== undefined && productionPattern.test(value);
    }),
  );
};
