/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { cssNames } from "@freelensapp/utilities";
import { useMemo } from "react";
import { describeFilter } from "../../common/model";
import { validateHostnames, validateHttpRules } from "../../common/validation";
import styles from "./gateway-api.module.scss";
import { SafeApply } from "./safe-apply";
import { useDraft } from "./use-draft";

import type { HttpMatch, HttpRule } from "../../common/model";
import type { ValidationIssue } from "../../common/validation";

export interface HttpRouteDraft {
  hostnames: string[];
  rules: HttpRule[];
}

export interface HttpRouteEditorProps {
  readonly objectName: string;
  readonly value: HttpRouteDraft;
  readonly allowed: boolean | undefined;
  readonly protectedTarget: boolean;
  readonly onApply: (value: HttpRouteDraft) => Promise<void>;
}

const invalid = (issues: readonly ValidationIssue[], path: string) => ({
  [styles.invalid]: issues.some((issue) => issue.path.startsWith(path)),
});

const emptyMatch = (): HttpMatch => ({ path: { type: "PathPrefix", value: "/" }, headers: [], queryParams: [] });

const newRule = (): HttpRule => ({
  matches: [emptyMatch()],
  filters: [],
  backendRefs: [{ name: "", port: 80 }],
  rest: {},
});

const redirectFilter = (statusCode: number) => ({
  type: "RequestRedirect",
  raw: { type: "RequestRedirect", requestRedirect: { scheme: "https", statusCode } },
});

const rewriteFilter = () => ({
  type: "URLRewrite",
  raw: { type: "URLRewrite", urlRewrite: { path: { type: "ReplacePrefixMatch", replacePrefixMatch: "/" } } },
});

/**
 * A visual editor of the hostnames and rules of an HTTPRoute: matches,
 * backends with weights, redirects, rewrites and timeouts. Filters it does
 * not edit stay in the rule as they are.
 */
export const HttpRouteEditor = ({ objectName, value, allowed, protectedTarget, onApply }: HttpRouteEditorProps) => {
  const { draft, setDraft, dirty, changedInCluster, reset, apply } = useDraft<HttpRouteDraft>(value);
  const issues = useMemo(() => [...validateHostnames(draft.hostnames), ...validateHttpRules(draft.rules)], [draft]);

  const setRule = (index: number, change: (rule: HttpRule) => HttpRule) =>
    setDraft({ ...draft, rules: draft.rules.map((rule, position) => (position === index ? change(rule) : rule)) });

  const setMatch = (ruleIndex: number, matchIndex: number, change: Partial<HttpMatch>) =>
    setRule(ruleIndex, (rule) => ({
      ...rule,
      matches: rule.matches.map((match, position) => (position === matchIndex ? { ...match, ...change } : match)),
    }));

  const setBackend = (ruleIndex: number, refIndex: number, change: Partial<HttpRule["backendRefs"][number]>) =>
    setRule(ruleIndex, (rule) => ({
      ...rule,
      backendRefs: rule.backendRefs.map((ref, position) => (position === refIndex ? { ...ref, ...change } : ref)),
    }));

  const numberOrUndefined = (text: string) => (text === "" ? undefined : Number(text));

  return (
    <div className={styles.editor} data-testid="gateway-api-http-route-editor">
      <label className={cssNames(styles.field, invalid(issues, "hostnames"))}>
        Hostnames (comma separated, empty for any)
        <input
          value={draft.hostnames.join(", ")}
          onChange={(event) =>
            setDraft({
              ...draft,
              hostnames: event.target.value
                .split(",")
                .map((hostname) => hostname.trim())
                .filter(Boolean),
            })
          }
        />
      </label>

      {draft.rules.map((rule, ruleIndex) => {
        const rulePath = `rules[${ruleIndex}]`;
        const totalWeight = rule.backendRefs.reduce((sum, ref) => sum + (ref.weight ?? 1), 0);
        const filterTypes = rule.filters.map((filter) => filter.type);

        return (
          <fieldset key={ruleIndex} className={styles.card} aria-label={`Rule ${ruleIndex + 1}`}>
            <div className={styles.cardHeader}>
              <strong>Rule {ruleIndex + 1}</strong>
              <span>
                <button
                  type="button"
                  className={styles.iconButton}
                  disabled={ruleIndex === 0}
                  aria-label={`Move rule ${ruleIndex + 1} up`}
                  onClick={() => {
                    const rules = [...draft.rules];

                    [rules[ruleIndex - 1], rules[ruleIndex]] = [rules[ruleIndex], rules[ruleIndex - 1]];
                    setDraft({ ...draft, rules });
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Remove rule ${ruleIndex + 1}`}
                  onClick={() =>
                    setDraft({ ...draft, rules: draft.rules.filter((_, position) => position !== ruleIndex) })
                  }
                >
                  Remove
                </button>
              </span>
            </div>

            <div className={styles.sectionTitle}>Matches (any of)</div>
            {rule.matches.map((match, matchIndex) => {
              const matchPath = `${rulePath}.matches[${matchIndex}]`;

              return (
                <div key={matchIndex} className={styles.editorRow}>
                  <label className={styles.field}>
                    Method
                    <select
                      value={match.method ?? ""}
                      onChange={(event) => setMatch(ruleIndex, matchIndex, { method: event.target.value || undefined })}
                    >
                      <option value="">Any</option>
                      {["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"].map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={cssNames(styles.field, invalid(issues, `${matchPath}.path.type`))}>
                    Path type
                    <select
                      value={match.path?.type ?? "PathPrefix"}
                      onChange={(event) =>
                        setMatch(ruleIndex, matchIndex, {
                          path: { type: event.target.value, value: match.path?.value ?? "/" },
                        })
                      }
                    >
                      <option value="PathPrefix">Prefix</option>
                      <option value="Exact">Exact</option>
                      <option value="RegularExpression">Regex</option>
                    </select>
                  </label>
                  <label className={cssNames(styles.field, invalid(issues, `${matchPath}.path.value`))}>
                    Path
                    <input
                      value={match.path?.value ?? "/"}
                      onChange={(event) =>
                        setMatch(ruleIndex, matchIndex, {
                          path: { type: match.path?.type ?? "PathPrefix", value: event.target.value },
                        })
                      }
                    />
                  </label>
                  <label className={cssNames(styles.field, invalid(issues, `${matchPath}.headers`))}>
                    Header (name=value)
                    <input
                      value={match.headers.map((header) => `${header.name}=${header.value}`).join(", ")}
                      placeholder="x-version=2"
                      onChange={(event) =>
                        setMatch(ruleIndex, matchIndex, {
                          headers: event.target.value
                            .split(",")
                            .map((pair) => pair.trim())
                            .filter(Boolean)
                            .map((pair) => {
                              const [name, ...rest] = pair.split("=");

                              return { type: "Exact", name: name.trim(), value: rest.join("=").trim() };
                            }),
                        })
                      }
                    />
                  </label>
                  <label className={cssNames(styles.field, invalid(issues, `${matchPath}.queryParams`))}>
                    Query (name=value)
                    <input
                      value={match.queryParams.map((query) => `${query.name}=${query.value}`).join(", ")}
                      onChange={(event) =>
                        setMatch(ruleIndex, matchIndex, {
                          queryParams: event.target.value
                            .split(",")
                            .map((pair) => pair.trim())
                            .filter(Boolean)
                            .map((pair) => {
                              const [name, ...rest] = pair.split("=");

                              return { type: "Exact", name: name.trim(), value: rest.join("=").trim() };
                            }),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remove match ${matchIndex + 1}`}
                    onClick={() =>
                      setRule(ruleIndex, (current) => ({
                        ...current,
                        matches: current.matches.filter((_, position) => position !== matchIndex),
                      }))
                    }
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() =>
                setRule(ruleIndex, (current) => ({ ...current, matches: [...current.matches, emptyMatch()] }))
              }
            >
              + Match
            </button>

            <div className={styles.sectionTitle}>Backends</div>
            {rule.backendRefs.map((ref, refIndex) => {
              const refPath = `${rulePath}.backendRefs[${refIndex}]`;
              const share = totalWeight > 0 ? Math.round(((ref.weight ?? 1) / totalWeight) * 100) : 0;

              return (
                <div key={refIndex} className={styles.editorRow}>
                  <label className={cssNames(styles.field, invalid(issues, `${refPath}.name`))}>
                    Service
                    <input
                      value={ref.name}
                      onChange={(event) => setBackend(ruleIndex, refIndex, { name: event.target.value })}
                    />
                  </label>
                  <label className={cssNames(styles.field, invalid(issues, `${refPath}.namespace`))}>
                    Namespace
                    <input
                      value={ref.namespace ?? ""}
                      placeholder="same"
                      onChange={(event) =>
                        setBackend(ruleIndex, refIndex, { namespace: event.target.value || undefined })
                      }
                    />
                  </label>
                  <label className={cssNames(styles.field, invalid(issues, `${refPath}.port`))}>
                    Port
                    <input
                      type="number"
                      value={ref.port ?? ""}
                      onChange={(event) =>
                        setBackend(ruleIndex, refIndex, { port: numberOrUndefined(event.target.value) })
                      }
                    />
                  </label>
                  <label className={cssNames(styles.field, invalid(issues, `${refPath}.weight`))}>
                    Weight ({share}%)
                    <input
                      type="number"
                      min={0}
                      value={ref.weight ?? ""}
                      placeholder="1"
                      onChange={(event) =>
                        setBackend(ruleIndex, refIndex, { weight: numberOrUndefined(event.target.value) })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remove backend ${ref.name || refIndex + 1}`}
                    onClick={() =>
                      setRule(ruleIndex, (current) => ({
                        ...current,
                        backendRefs: current.backendRefs.filter((_, position) => position !== refIndex),
                      }))
                    }
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() =>
                setRule(ruleIndex, (current) => ({
                  ...current,
                  backendRefs: [...current.backendRefs, { name: "", port: 80 }],
                }))
              }
            >
              + Backend
            </button>

            <div className={styles.sectionTitle}>Filters and timeouts</div>
            <div>
              {rule.filters.map((filter, filterIndex) => (
                <span key={filterIndex} className={styles.chip}>
                  {describeFilter(filter.raw)}{" "}
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remove filter ${filter.type}`}
                    onClick={() =>
                      setRule(ruleIndex, (current) => ({
                        ...current,
                        filters: current.filters.filter((_, position) => position !== filterIndex),
                      }))
                    }
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            {filterTypes.includes("URLRewrite") && (
              <label className={styles.field}>
                Rewrite path prefix to
                <input
                  value={
                    ((rule.filters.find((filter) => filter.type === "URLRewrite")?.raw.urlRewrite as any)?.path
                      ?.replacePrefixMatch as string) ?? ""
                  }
                  onChange={(event) =>
                    setRule(ruleIndex, (current) => ({
                      ...current,
                      filters: current.filters.map((filter) =>
                        filter.type === "URLRewrite"
                          ? {
                              ...filter,
                              raw: {
                                ...filter.raw,
                                urlRewrite: {
                                  ...(filter.raw.urlRewrite as object),
                                  path: { type: "ReplacePrefixMatch", replacePrefixMatch: event.target.value },
                                },
                              },
                            }
                          : filter,
                      ),
                    }))
                  }
                />
              </label>
            )}
            <div className={styles.editorRow}>
              <button
                type="button"
                className={styles.iconButton}
                disabled={filterTypes.includes("RequestRedirect") || filterTypes.includes("URLRewrite")}
                onClick={() =>
                  setRule(ruleIndex, (current) => ({ ...current, filters: [...current.filters, redirectFilter(301)] }))
                }
              >
                + HTTPS redirect
              </button>
              <button
                type="button"
                className={styles.iconButton}
                disabled={filterTypes.includes("RequestRedirect") || filterTypes.includes("URLRewrite")}
                onClick={() =>
                  setRule(ruleIndex, (current) => ({ ...current, filters: [...current.filters, rewriteFilter()] }))
                }
              >
                + Path rewrite
              </button>
              <label className={cssNames(styles.field, invalid(issues, `${rulePath}.timeouts.request`))}>
                Request timeout
                <input
                  value={rule.timeouts?.request ?? ""}
                  placeholder="e.g. 10s"
                  onChange={(event) =>
                    setRule(ruleIndex, (current) => ({
                      ...current,
                      timeouts: { ...current.timeouts, request: event.target.value || undefined },
                    }))
                  }
                />
              </label>
              <label className={cssNames(styles.field, invalid(issues, `${rulePath}.timeouts.backendRequest`))}>
                Backend timeout
                <input
                  value={rule.timeouts?.backendRequest ?? ""}
                  placeholder="e.g. 5s"
                  onChange={(event) =>
                    setRule(ruleIndex, (current) => ({
                      ...current,
                      timeouts: { ...current.timeouts, backendRequest: event.target.value || undefined },
                    }))
                  }
                />
              </label>
            </div>
          </fieldset>
        );
      })}

      <div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setDraft({ ...draft, rules: [...draft.rules, newRule()] })}
        >
          + Add rule
        </button>
      </div>

      <SafeApply
        objectName={objectName}
        issues={issues}
        dirty={dirty}
        allowed={allowed}
        protectedTarget={protectedTarget}
        changedInCluster={changedInCluster}
        summary={`${draft.rules.length} rules, ${draft.hostnames.length} hostnames. Applying replaces spec.hostnames and spec.rules.`}
        onApply={() => apply(() => onApply(draft))}
        onReset={reset}
      />
    </div>
  );
};
