/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "../../../architecture-explorer/renderer/components/react-flow.scss";

import { Icon } from "@freelensapp/icon";
import { cssNames } from "@freelensapp/utilities";
import { withInjectables } from "@ogre-tools/injectable-react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { computed } from "mobx";
import { observer } from "mobx-react";
import { memo, useMemo, useState } from "react";
import queryParametersInjectable from "../../../../renderer/routes/query-parameters.injectable";
import { buildTopology, layoutTopology } from "../../common/topology";
import gatewayApiViewDependenciesInjectable, { asGatewayApiObject } from "../view-dependencies.injectable";
import styles from "./gateway-api.module.scss";
import { InstallGuidance } from "./overview";
import { HealthBadge, LinkButton, useSubscribedStores } from "./shared";

import type { Edge, Node, NodeProps } from "@xyflow/react";
import type { IComputedValue } from "mobx";

import type { GatewayApiResourceId } from "../../common/kinds";
import type { TopologyGraph, TopologyKind, TopologyNode } from "../../common/topology";
import type { GatewayApiViewDependencies } from "../view-dependencies.injectable";

const kindIcons: Record<TopologyKind, string> = {
  GatewayClass: "category",
  Gateway: "router",
  Listener: "hearing",
  Route: "alt_route",
  Service: "lan",
  Backend: "extension",
  EndpointSlice: "share",
  Pod: "view_in_ar",
};

interface TopologyNodeData extends Record<string, unknown> {
  readonly node: TopologyNode;
  readonly selected: boolean;
  readonly dimmed: boolean;
}

const TopologyNodeView = memo(({ data }: NodeProps<Node<TopologyNodeData, "topology">>) => {
  const { node, selected, dimmed } = data;

  return (
    <div
      className={cssNames(styles.node, styles[node.health], { [styles.selected]: selected, [styles.dimmed]: dimmed })}
      title={[`${node.objectKind} ${node.namespace ? `${node.namespace}/` : ""}${node.name}`, ...node.problems].join(
        "\n",
      )}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className={styles.nodeKind}>
        <Icon material={kindIcons[node.kind]} smallest />
        {node.objectKind}
        {node.missing ? " · missing" : ""}
      </div>
      <div className={styles.nodeName}>{node.name}</div>
      <div className={styles.nodeSub}>{node.subtitle ?? node.namespace ?? ""}</div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
});

const nodeTypes = { topology: TopologyNodeView };

const routeIds: GatewayApiResourceId[] = ["httproutes", "grpcroutes", "tcproutes", "tlsroutes", "udproutes"];

interface Dependencies {
  deps: GatewayApiViewDependencies;
  query: IComputedValue<Record<string, string>>;
}

const Inspector = ({
  node,
  graph,
  deps,
}: {
  node: TopologyNode;
  graph: TopologyGraph;
  deps: GatewayApiViewDependencies;
}) => {
  const incoming = graph.edges.filter((edge) => edge.target === node.id);
  const outgoing = graph.edges.filter((edge) => edge.source === node.id);
  const byId = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const describe = (id: string) => {
    const other = byId.get(id);

    return other ? `${other.objectKind} ${other.name}` : id;
  };

  return (
    <div>
      <div className={styles.nodeKind}>{node.objectKind}</div>
      <h3>{node.name}</h3>
      {node.namespace && <div className={styles.muted}>Namespace {node.namespace}</div>}
      <p>
        <HealthBadge health={node.health} />
      </p>
      {node.subtitle && <p>{node.subtitle}</p>}
      {node.problems.length > 0 && (
        <ul className={styles.errorList}>
          {node.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {node.selfLink && (
        <p>
          <LinkButton onClick={() => deps.showDetails(node.selfLink)}>Open details</LinkButton>
        </p>
      )}
      {incoming.length > 0 && (
        <>
          <strong>From</strong>
          <ul>
            {incoming.map((edge) => (
              <li key={edge.id} className={edge.broken ? styles.critical : undefined}>
                {describe(edge.source)}
                {edge.label ? ` (${edge.label})` : ""}
                {edge.reason ? ` — ${edge.reason}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {outgoing.length > 0 && (
        <>
          <strong>To</strong>
          <ul>
            {outgoing.map((edge) => (
              <li key={edge.id} className={edge.broken ? styles.critical : undefined}>
                {describe(edge.target)}
                {edge.label ? ` (${edge.label})` : ""}
                {edge.reason ? ` — ${edge.reason}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

const NonInjectedGatewayApiTopology = observer(({ deps, query }: Dependencies) => {
  const { gatewayApi } = deps;
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [showPods, setShowPods] = useState(true);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const gatewayFilter = query.get().gateway;

  const stores = [
    gatewayApi.storeOf("gatewayclasses"),
    gatewayApi.storeOf("gateways"),
    gatewayApi.storeOf("listenersets"),
    gatewayApi.storeOf("referencegrants"),
    ...routeIds.map((id) => gatewayApi.storeOf(id)),
    deps.serviceStore,
    deps.endpointSliceStore,
    showPods ? deps.podStore : undefined,
  ];

  useSubscribedStores(deps.subscribeStores, stores);

  // Recomputed only when the stores change, not on every render.
  const graphValue = useMemo(
    () =>
      computed(() => {
        const of = (id: GatewayApiResourceId) => (gatewayApi.storeOf(id)?.items ?? []).map(asGatewayApiObject);

        return buildTopology(
          {
            gatewayClasses: of("gatewayclasses"),
            gateways: of("gateways"),
            listenerSets: of("listenersets"),
            referenceGrants: of("referencegrants"),
            routes: routeIds.flatMap(of),
            services: deps.serviceStore.items.map(asGatewayApiObject),
            endpointSlices: deps.endpointSliceStore.items.map(asGatewayApiObject),
            pods: showPods ? deps.podStore.items.map(asGatewayApiObject) : [],
          },
          {
            namespaces: deps.context.hasSelectedAll ? [] : deps.context.contextNamespaces,
            gateway: gatewayFilter,
            showPods,
          },
        );
      }),
    [gatewayApi, deps, showPods, gatewayFilter],
  );
  const graph = graphValue.get();
  const positions = useMemo(() => layoutTopology(graph), [graph]);

  if (!gatewayApi.isSupported("gateways") && !gatewayApi.isSupported("gatewayclasses")) {
    return (
      <div className={cssNames(styles.page, styles.empty)} data-testid="gateway-api-topology-unavailable">
        <p>Gateways are not available in this cluster, or you may not list them.</p>
        <InstallGuidance />
      </div>
    );
  }

  const problemIds = new Set(
    graph.nodes
      .filter((node) => node.health === "critical" || node.health === "missing" || node.health === "warning")
      .map((node) => node.id),
  );

  for (const edge of graph.edges.filter((candidate) => candidate.broken)) {
    problemIds.add(edge.source);
    problemIds.add(edge.target);
  }

  const neighbours = new Set<string>();

  if (selected) {
    neighbours.add(selected);
    for (const edge of graph.edges) {
      if (edge.source === selected) neighbours.add(edge.target);
      if (edge.target === selected) neighbours.add(edge.source);
    }
  }

  const nodes: Node<TopologyNodeData, "topology">[] = graph.nodes.map((node) => ({
    id: node.id,
    type: "topology",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      node,
      selected: node.id === selected,
      dimmed: (problemsOnly && !problemIds.has(node.id)) || (selected !== undefined && !neighbours.has(node.id)),
    },
    draggable: true,
    ariaLabel: `${node.objectKind} ${node.name}, ${node.health}`,
  }));

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? (edge.broken ? edge.reason : undefined),
    animated: !edge.broken && edge.label?.includes("%"),
    style: {
      stroke: edge.broken ? "var(--colorError)" : "var(--textColorTertiary)",
      strokeDasharray: edge.broken ? "6 4" : undefined,
      opacity: selected && !(neighbours.has(edge.source) && neighbours.has(edge.target)) ? 0.25 : 1,
    },
    labelStyle: { fill: edge.broken ? "var(--colorError)" : "var(--textColorSecondary)", fontSize: 11 },
    labelBgStyle: { fill: "var(--contentColor)" },
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.broken ? "var(--colorError)" : "var(--textColorTertiary)" },
  }));

  const selectedNode = graph.nodes.find((node) => node.id === selected);

  return (
    <div className={cssNames(styles.root, styles.topology)} data-testid="gateway-api-topology">
      <div className={styles.toolbar} role="toolbar" aria-label="Topology options">
        <strong>Gateway API topology</strong>
        {gatewayFilter && (
          <span className={styles.chip}>
            Gateway {gatewayFilter}{" "}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => deps.navigateToTopology()}
              aria-label="Show all gateways"
            >
              ✕
            </button>
          </span>
        )}
        <label>
          <input type="checkbox" checked={showPods} onChange={(event) => setShowPods(event.target.checked)} /> Pods
        </label>
        <label>
          <input type="checkbox" checked={problemsOnly} onChange={(event) => setProblemsOnly(event.target.checked)} />{" "}
          Highlight problems
        </label>
        <span className={styles.muted}>
          {graph.nodes.length} nodes · {graph.edges.length} edges
          {graph.truncated ? ` · ${graph.truncated} hidden (limit)` : ""}
        </span>
        <span className={styles.legend}>
          <HealthBadge health={graph.problems ? "critical" : "healthy"} label={`${graph.problems} problems`} />
        </span>
      </div>
      <div className={styles.canvas}>
        <div className={styles.flow}>
          {graph.nodes.length === 0 ? (
            <div className={cssNames(styles.page, styles.empty)}>
              No Gateways or routes in the selected namespaces. Select more namespaces, or create a Gateway.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_event, node) => setSelected(node.id === selected ? undefined : node.id)}
              onNodeDoubleClick={(_event, node) => {
                const link = graph.nodes.find((candidate) => candidate.id === node.id)?.selfLink;

                if (link) deps.showDetails(link);
              }}
              onPaneClick={() => setSelected(undefined)}
              nodesConnectable={false}
              elementsSelectable
              onlyRenderVisibleElements
              fitView
              minZoom={0.05}
              maxZoom={2.5}
              proOptions={{ hideAttribution: true }}
              deleteKeyCode={null}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--borderColor)" />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap
                pannable
                zoomable
                position="bottom-right"
                nodeStrokeWidth={0}
                ariaLabel="Overview of the topology"
                nodeColor={(node) => {
                  const health = (node.data as TopologyNodeData).node.health;

                  return health === "healthy"
                    ? "var(--colorSuccess)"
                    : health === "warning"
                      ? "var(--colorWarning)"
                      : health === "unknown"
                        ? "var(--textColorTertiary)"
                        : "var(--colorError)";
                }}
              />
            </ReactFlow>
          )}
        </div>
        {selectedNode && (
          <aside className={styles.inspector} aria-label="Selected resource">
            <Inspector node={selectedNode} graph={graph} deps={deps} />
          </aside>
        )}
      </div>
    </div>
  );
});

const InjectedTopology = withInjectables<Dependencies>(NonInjectedGatewayApiTopology, {
  getProps: (di) => ({
    deps: di.inject(gatewayApiViewDependenciesInjectable),
    query: di.inject(queryParametersInjectable),
  }),
});

export const GatewayApiTopology = () => (
  <ReactFlowProvider>
    <InjectedTopology />
  </ReactFlowProvider>
);
