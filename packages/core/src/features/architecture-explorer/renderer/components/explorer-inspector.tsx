/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { cssNames } from "@freelensapp/utilities";
import { observer } from "mobx-react";
import React from "react";
import styles from "./architecture-explorer.module.scss";
import { useExplorer } from "./explorer-context";
import { kindIcon } from "./kind-icons";

import type { GraphEdge, GraphNode, Provenance, Relation } from "../graph/types";

const provenanceClass: Record<Provenance, string> = {
  observed: styles.provenanceObserved,
  referenced: styles.provenanceReferenced,
  inferred: styles.provenanceInferred,
};

export const provenanceMeaning: Record<Provenance, string> = {
  observed: "Recorded by the cluster",
  referenced: "Named in a spec; the target may not exist",
  inferred: "Worked out by ProLens from selectors or defaults",
};

const outgoingText: Record<Relation, string> = {
  owns: "owns",
  "runs-on": "runs on",
  selects: "selects",
  endpoints: "has EndpointSlice",
  "routes-to": "routes to",
  attaches: "carries route",
  class: "uses class",
  mounts: "mounts",
  env: "reads environment from",
  "service-account": "runs as",
  "pull-secret": "pulls images with",
  binds: "is bound to",
  "applies-to": "applies to",
};

const incomingText: Record<Relation, string> = {
  owns: "owned by",
  "runs-on": "runs pod",
  selects: "selected by",
  endpoints: "EndpointSlice of",
  "routes-to": "receives traffic from",
  attaches: "attached to gateway",
  class: "class of",
  mounts: "mounted by",
  env: "environment of",
  "service-account": "used by",
  "pull-secret": "pull secret of",
  binds: "bound to",
  "applies-to": "selected by policy",
};

const ProvenanceBadge = ({ provenance }: { provenance: Provenance }) => (
  <span className={cssNames(styles.provenance, provenanceClass[provenance])} title={provenanceMeaning[provenance]}>
    {provenance}
  </span>
);

const healthClass = (health: GraphNode["health"]) => styles[health];

const Relations = observer(({ node }: { node: GraphNode }) => {
  const { vm, actions } = useExplorer();
  const { incoming, outgoing } = vm.edgesOf(node.id);
  const go = (id: string) => {
    const visible = vm.view.nodes.find((candidate) => candidate.id === id || candidate.members?.includes(id));

    vm.select(visible?.id ?? id);

    if (visible) actions.centerOn(visible.id);
  };
  const row = (edge: GraphEdge, direction: "in" | "out") => {
    const other = vm.graph.nodes.get(direction === "out" ? edge.target : edge.source);

    return (
      <li key={`${direction}|${edge.id}`}>
        <button type="button" className={styles.relation} onClick={() => go(other?.id ?? "")}>
          <ProvenanceBadge provenance={edge.provenance} />
          <span>
            {direction === "out" ? outgoingText[edge.relation] : incomingText[edge.relation]}{" "}
            <strong>
              {other?.kind} {other?.name}
            </strong>
            {edge.broken && <span className={styles.notice}> (broken)</span>}
            <small>{edge.evidence}</small>
          </span>
        </button>
      </li>
    );
  };

  if (!incoming.length && !outgoing.length) {
    return null;
  }

  return (
    <section>
      <h4>Relationships</h4>
      <ul className={styles.list}>
        {outgoing.slice(0, 60).map((edge) => row(edge, "out"))}
        {incoming.slice(0, 60).map((edge) => row(edge, "in"))}
      </ul>
      {incoming.length + outgoing.length > 120 && <p className={styles.path}>Showing the first 120 relationships.</p>}
    </section>
  );
});

const Findings = observer(() => {
  const { vm, actions } = useExplorer();
  const analysis = vm.analysis;

  if (!analysis || vm.settings.mode !== "application") {
    return null;
  }

  const name = (id: string) => {
    const node = vm.graph.nodes.get(id);

    return node ? `${node.kind} ${node.name}` : id;
  };
  const roots = analysis.findings.filter((finding) => finding.rootCause);

  return (
    <section>
      <h4>Diagnosis</h4>
      {analysis.findings.length === 0 ? (
        <p className={cssNames(styles.reason, styles.healthy)}>
          No problem found in what {name(analysis.focus)} depends on: {analysis.dependencies.size - 1} resources
          checked.
        </p>
      ) : (
        <p className={styles.path}>
          {roots.length} likely root cause{roots.length === 1 ? "" : "s"} among {analysis.findings.length} problems in{" "}
          {analysis.dependencies.size - 1} dependencies.
        </p>
      )}
      <ul className={styles.list}>
        {analysis.findings.slice(0, 25).map((finding) => (
          <li key={finding.nodeId}>
            <button
              type="button"
              className={cssNames(styles.finding, { [styles.rootCause]: finding.rootCause })}
              onClick={() => {
                const visible = vm.view.nodes.find(
                  (node) => node.id === finding.nodeId || node.members?.includes(finding.nodeId),
                );

                vm.select(visible?.id ?? finding.nodeId);

                if (visible) actions.centerOn(visible.id);
              }}
            >
              <strong>
                <Icon material={finding.rootCause ? "gps_fixed" : "subdirectory_arrow_right"} smallest />
                {finding.rootCause ? "Root cause: " : ""}
                {name(finding.nodeId)}
              </strong>
              <ul>
                {finding.evidence.slice(0, 5).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {finding.path.length > 1 && <div className={styles.path}>{finding.path.map(name).join(" → ")}</div>}
            </button>
          </li>
        ))}
      </ul>
      {analysis.networkNotes.length > 0 && (
        <>
          <h4>Network policies</h4>
          <ul className={styles.list}>
            {analysis.networkNotes.slice(0, 10).map((note) => (
              <li key={`${note.policyId}|${note.podId}`} className={cssNames(styles.reason, styles.warning)}>
                {note.note} (for {name(note.podId)})
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={styles.path}>
        A change of {name(analysis.focus)} would affect {analysis.impact.size - 1} other resource
        {analysis.impact.size === 2 ? "" : "s"}.
      </p>
    </section>
  );
});

const NodeDetails = observer(() => {
  const { vm, actions } = useExplorer();
  const viewNode = vm.selectedViewNode;

  if (!viewNode) return null;

  const node = viewNode.type === "resource" ? viewNode.node : undefined;

  return (
    <>
      <div className={cssNames(styles.inspectorHeader, healthClass(viewNode.health))}>
        <span className={styles.kindIcon}>
          <Icon material={kindIcon(viewNode.kind)} small />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 title={viewNode.label}>{viewNode.label}</h3>
          <p>{[viewNode.kind, viewNode.node.namespace, node?.status].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" className={styles.toolButton} onClick={() => vm.select(undefined)} aria-label="Close">
          <Icon material="close" smallest />
        </button>
      </div>
      <div className={styles.inspectorBody}>
        <section className={styles.actions}>
          {node?.selfLink && !node.placeholder && (
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => actions.openDetails(node.selfLink as string)}
            >
              <Icon material="open_in_new" smallest />
              Details, events, YAML
            </button>
          )}
          {node && (
            <button type="button" className={styles.toolButton} onClick={() => vm.focusOn(node.id)}>
              <Icon material="hub" smallest />
              Explore dependencies
            </button>
          )}
          {viewNode.type === "aggregate" && (
            <button type="button" className={styles.toolButton} onClick={() => vm.toggle("expanded", viewNode.id)}>
              <Icon material="unfold_more" smallest />
              Show each pod
            </button>
          )}
          {viewNode.type === "group" && (
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => vm.toggle("collapsedGroups", viewNode.group)}
            >
              <Icon material="unfold_more" smallest />
              Expand group
            </button>
          )}
        </section>

        {node && node.reasons.length > 0 && (
          <section>
            <h4>Health</h4>
            <ul className={styles.list}>
              {node.reasons.map((reason) => (
                <li key={reason} className={cssNames(styles.reason, healthClass(node.health))}>
                  {reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        {node && node.warningEvents.length > 0 && (
          <section>
            <h4>Warning events</h4>
            <ul className={styles.list}>
              {node.warningEvents.map((event) => (
                <li key={`${event.reason}|${event.message}`} className={cssNames(styles.reason, styles.warning)}>
                  <strong>{event.reason}</strong>
                  {event.count > 1 ? ` ×${event.count}` : ""}: {event.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {node && node.details.length > 0 && (
          <section>
            <h4>Rules</h4>
            <ul className={styles.list}>
              {node.details.map((detail) => (
                <li key={detail} className={cssNames(styles.reason, styles.unknown)}>
                  {detail}
                </li>
              ))}
            </ul>
          </section>
        )}

        {viewNode.members && (
          <section>
            <h4>{viewNode.members.length} members</h4>
            <ul className={styles.list}>
              {viewNode.members.slice(0, 50).map((member) => {
                const memberNode = vm.graph.nodes.get(member);

                return (
                  <li key={member}>
                    <button
                      type="button"
                      className={styles.relation}
                      onClick={() => memberNode?.selfLink && actions.openDetails(memberNode.selfLink)}
                    >
                      <span className={cssNames(styles.dot, healthClass(memberNode?.health ?? "unknown"))} />
                      <span>
                        {memberNode?.name}
                        <small>{memberNode?.status ?? memberNode?.reasons[0]}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {node && <Relations node={node} />}

        {node && Object.keys(node.labels).length > 0 && (
          <section>
            <h4>Labels</h4>
            <dl className={styles.keyValue}>
              {Object.entries(node.labels).map(([key, value]) => (
                <React.Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        )}
      </div>
    </>
  );
});

const EdgeDetails = observer(() => {
  const { vm, actions } = useExplorer();
  const edge = vm.selectedViewEdge;

  if (!edge) return null;

  const label = (id: string) => vm.view.nodes.find((node) => node.id === id);
  const source = label(edge.source);
  const target = label(edge.target);

  return (
    <>
      <div className={styles.inspectorHeader}>
        <span className={styles.kindIcon}>
          <Icon material="trending_flat" small />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{outgoingText[edge.relation]}</h3>
          <p>
            {edge.count > 1 ? `${edge.count} relationships · ` : ""}
            {provenanceMeaning[edge.provenance]}
          </p>
        </div>
        <button type="button" className={styles.toolButton} onClick={() => vm.selectEdge(undefined)} aria-label="Close">
          <Icon material="close" smallest />
        </button>
      </div>
      <div className={styles.inspectorBody}>
        <section>
          <h4>Between</h4>
          {[source, target].map(
            (end) =>
              end && (
                <button
                  key={end.id}
                  type="button"
                  className={styles.relation}
                  onClick={() => {
                    vm.select(end.id);
                    actions.centerOn(end.id);
                  }}
                >
                  <Icon material={kindIcon(end.kind)} smallest />
                  <span>
                    {end.kind} {end.label}
                  </span>
                </button>
              ),
          )}
        </section>
        <section>
          <h4>Evidence</h4>
          <p className={cssNames(styles.reason, edge.broken ? styles.critical : styles.unknown)}>
            <ProvenanceBadge provenance={edge.provenance} /> {edge.evidence}
            {edge.bridged ? " (the resources between them are hidden in this view)" : ""}
          </p>
        </section>
      </div>
    </>
  );
});

export const ExplorerInspector = observer(() => {
  const { vm } = useExplorer();
  const showFindings = vm.settings.mode === "application" && vm.analysis;

  if (!vm.selectedViewNode && !vm.selectedViewEdge && !showFindings) {
    return null;
  }

  return (
    <aside className={styles.inspector} aria-label="Inspector" data-testid="explorer-inspector">
      {vm.selectedViewEdge ? (
        <EdgeDetails />
      ) : vm.selectedViewNode ? (
        <NodeDetails />
      ) : (
        <div className={styles.inspectorBody}>
          <Findings />
        </div>
      )}
      {(vm.selectedViewEdge || vm.selectedViewNode) && showFindings && (
        <div
          className={styles.inspectorBody}
          style={{ flex: "none", maxHeight: "40%", borderTop: "1px solid var(--borderColor)" }}
        >
          <Findings />
        </div>
      )}
    </aside>
  );
});
