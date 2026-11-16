/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface SelectorRequirement {
  readonly key: string;
  readonly operator: string;
  readonly values?: readonly string[];
}

export interface Selector {
  readonly matchLabels?: Partial<Record<string, string>>;
  readonly matchExpressions?: readonly SelectorRequirement[];
}

type Labels = Partial<Record<string, string>>;

/**
 * Whether labels match a label selector, as the API server decides. An empty
 * selector matches everything; an unknown operator matches nothing.
 */
export const matchesSelector = (selector: Selector, labels: Labels = {}): boolean => {
  for (const [key, value] of Object.entries(selector.matchLabels ?? {})) {
    if (labels[key] !== value) {
      return false;
    }
  }

  for (const { key, operator, values = [] } of selector.matchExpressions ?? []) {
    const has = Object.hasOwn(labels, key) && labels[key] !== undefined;
    const value = labels[key];

    switch (operator) {
      case "In":
        if (!has || !values.includes(value as string)) return false;
        break;
      case "NotIn":
        if (has && values.includes(value as string)) return false;
        break;
      case "Exists":
        if (!has) return false;
        break;
      case "DoesNotExist":
        if (has) return false;
        break;
      default:
        return false;
    }
  }

  return true;
};

/** A selector written as Kubernetes prints it: `app=web,tier in (a,b)`. */
export const describeSelector = (selector: Selector): string => {
  const parts = Object.entries(selector.matchLabels ?? {}).map(([key, value]) => `${key}=${value}`);

  for (const { key, operator, values = [] } of selector.matchExpressions ?? []) {
    switch (operator) {
      case "In":
        parts.push(`${key} in (${values.join(",")})`);
        break;
      case "NotIn":
        parts.push(`${key} notin (${values.join(",")})`);
        break;
      case "Exists":
        parts.push(key);
        break;
      case "DoesNotExist":
        parts.push(`!${key}`);
        break;
      default:
        parts.push(`${key} ${operator} (${values.join(",")})`);
    }
  }

  return parts.length ? parts.join(",") : "(everything)";
};

export const isEmptySelector = (selector: Selector | undefined): boolean =>
  !selector || (Object.keys(selector.matchLabels ?? {}).length === 0 && (selector.matchExpressions ?? []).length === 0);

/**
 * Objects indexed by label pairs, so that a selector with `matchLabels`
 * starts from the smallest matching set instead of every object.
 */
export class LabelIndex<T> {
  private readonly byPair = new Map<string, T[]>();

  constructor(
    private readonly items: readonly T[],
    private readonly labelsOf: (item: T) => Labels | undefined,
  ) {
    for (const item of items) {
      for (const [key, value] of Object.entries(labelsOf(item) ?? {})) {
        const pair = `${key}=${value}`;
        const list = this.byPair.get(pair);

        if (list) {
          list.push(item);
        } else {
          this.byPair.set(pair, [item]);
        }
      }
    }
  }

  select(selector: Selector): T[] {
    let candidates: readonly T[] = this.items;

    for (const [key, value] of Object.entries(selector.matchLabels ?? {})) {
      const list = this.byPair.get(`${key}=${value}`) ?? [];

      if (list.length < candidates.length) {
        candidates = list;
      }
    }

    return candidates.filter((item) => matchesSelector(selector, this.labelsOf(item)));
  }
}
