/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./react-flow.scss";

import { withInjectables } from "@ogre-tools/injectable-react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { reaction } from "mobx";
import { observer } from "mobx-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import showDetailsInjectable from "../../../../renderer/components/kube-detail-params/show-details.injectable";
import subscribeStoresInjectable from "../../../../renderer/kube-watch-api/subscribe-stores.injectable";
import openSaveFileDialogInjectable from "../../../../renderer/utils/save-file.injectable";
import clusterSnapshotSourceInjectable from "../cluster-snapshot.injectable";
import explorerViewModelInjectable from "../explorer-view-model.injectable";
import { renderSvg } from "../graph/export-svg";
import { nodeSize } from "../graph/layout";
import styles from "./architecture-explorer.module.scss";
import { ExplorerContext } from "./explorer-context";
import { ExplorerInspector } from "./explorer-inspector";
import { ContextMenu, EmptyView, FocusPicker, Legend, StatusBar } from "./explorer-overlays";
import { ExplorerToolbar } from "./explorer-toolbar";
import { paletteFromTheme, svgToPng } from "./export-image";
import { BandNode, ResourceNode } from "./resource-node";

import type { Edge, Node, NodeMouseHandler, OnNodeDrag } from "@xyflow/react";

import type { ShowDetails } from "../../../../renderer/components/kube-detail-params/show-details.injectable";
import type { SubscribeStores } from "../../../../renderer/kube-watch-api/kube-watch-api";
import type { ClusterSnapshotSource } from "../cluster-snapshot.injectable";
import type { ExplorerViewModel } from "../explorer-view-model";
import type { Health } from "../graph/types";
import type { BandNodeData, ResourceNodeData } from "./resource-node";

const nodeTypes = { resource: ResourceNode, band: BandNode };

const sameStores = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((store, index) => store === b[index]);

const miniMapColor: Record<Health, string> = {
  healthy: "var(--colorSuccess)",
  warning: "var(--colorWarning)",
  critical: "var(--colorError)",
  missing: "var(--colorError)",
  unknown: "var(--textColorTertiary)",
};

interface Dependencies {
  readonly vm: ExplorerViewModel;
  readonly source: ClusterSnapshotSource;
  readonly subscribeStores: SubscribeStores;
  readonly showDetails: ShowDetails;
  readonly saveFile: (filename: string, contents: BlobPart | BlobPart[], type: string) => void;
}

const ExplorerCanvas = observer(({ vm, source, saveFile, showDetails }: Omit<Dependencies, "subscribeStores">) => {
  const flow = useReactFlow();
  const searchRef = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const { view, layout, settings } = vm;
  const direction = settings.direction;
  const searching = vm.search.trim().length > 0;
  const pinned = vm.pinned;

  // The nodes without selection, so that selecting re-renders only the nodes it changes.
  const placedNodes = useMemo(() => {
    const nodes: Node[] = layout.groups.map((group) => {
      const viewGroup = view.groups.find((candidate) => candidate.id === group.id);
      const data: BandNodeData = {
        label: group.label,
        size: viewGroup?.size ?? 0,
        problems: viewGroup?.problems ?? 0,
        collapsed: viewGroup?.collapsed ?? false,
        onToggle: () => vm.toggle("collapsedGroups", group.id),
      };

      return {
        id: `band|${group.id}`,
        type: "band",
        position: { x: group.x, y: group.y },
        data,
        style: { width: group.width, height: group.height },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      };
    });

    for (const viewNode of view.nodes) {
      const position = layout.positions.get(viewNode.id);

      if (!position) continue;

      const data: ResourceNodeData = {
        viewNode,
        direction,
        dimmed: searching && !viewNode.matched,
        pinned: pinned.has(viewNode.id),
      };

      nodes.push({
        id: viewNode.id,
        type: "resource",
        position,
        data,
        width: nodeSize.width,
        height: nodeSize.height,
        ariaLabel: `${viewNode.kind} ${viewNode.label}, ${viewNode.health}`,
      });
    }

    return nodes;
  }, [layout, view, direction, searching, pinned, vm]);

  const selectedNodeId = vm.selectedNodeId;
  const derivedNodes = useMemo(
    () => placedNodes.map((node) => (node.id === selectedNodeId ? { ...node, selected: true } : node)),
    [placedNodes, selectedNodeId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(derivedNodes);

  useEffect(() => setNodes(derivedNodes), [derivedNodes, setNodes]);

  const edges = useMemo(
    (): Edge[] =>
      view.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "default",
        className: [
          styles.edge,
          styles[edge.provenance],
          edge.broken ? styles.broken : "",
          edge.role === "dependency" ? styles.edgeDependency : edge.role === "impact" ? styles.edgeImpact : "",
          searching ? styles.edgeDimmed : "",
        ].join(" "),
        label: edge.count > 1 ? `×${edge.count}` : undefined,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        selected: vm.selectedEdgeId === edge.id,
        ariaLabel: `${edge.relation}, ${edge.provenance}`,
      })),
    [view, searching, vm.selectedEdgeId],
  );

  const fitView = useCallback(() => {
    void flow.fitView({ padding: 0.12, duration: 300, maxZoom: 1.2 });
  }, [flow]);

  const centerOn = useCallback(
    (id: string) => {
      const position = layout.positions.get(id);

      if (position) {
        void flow.setCenter(position.x + nodeSize.width / 2, position.y + nodeSize.height / 2, {
          zoom: Math.max(flow.getZoom(), 0.9),
          duration: 350,
        });
      }
    },
    [flow, layout],
  );

  // Fit when the view changes to another one, not on every update of the data.
  const viewKey = `${vm.pinKey}|${vm.groupBy}|${direction}|${view.nodes.length === 0}`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => fitView());

    return () => cancelAnimationFrame(frame);
  }, [viewKey, fitView]);

  // Keyboard: "/" searches, "F" fits, Escape clears.
  useEffect(() => {
    const element = container.current;

    if (!element) return undefined;

    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if ((event.key === "f" || event.key === "F") && !typing && !event.metaKey && !event.ctrlKey) {
        fitView();
      } else if (event.key === "Escape" && !typing) {
        vm.select(undefined);
        vm.openContextMenu(undefined);
      }
    };

    element.addEventListener("keydown", onKey);

    return () => element.removeEventListener("keydown", onKey);
  }, [fitView, vm]);

  const onExport = useCallback(
    async (format: "svg" | "png") => {
      const svg = renderSvg(view, layout, direction, paletteFromTheme(container.current ?? undefined));
      const name = `architecture-${settings.mode}`;

      if (format === "svg") {
        saveFile(`${name}.svg`, svg, "image/svg+xml");
      } else {
        const blob = await svgToPng(svg, layout.width + 48, layout.height + 48);

        saveFile(`${name}.png`, blob, "image/png");
      }
    },
    [view, layout, direction, settings.mode, saveFile],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => node.type === "resource" && vm.select(node.id),
    [vm],
  );
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const viewNode = (node.data as ResourceNodeData).viewNode;

      if (!viewNode) return;
      if (viewNode.type === "aggregate") vm.toggle("expanded", viewNode.id);
      else if (viewNode.type === "group") vm.toggle("collapsedGroups", viewNode.group);
      else vm.focusOn(viewNode.id);
    },
    [vm],
  );
  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      if (node.type !== "resource") return;

      event.preventDefault();
      vm.openContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
    },
    [vm],
  );
  const onNodeDragStop: OnNodeDrag = useCallback((_event, node) => vm.pin(node.id, node.position), [vm]);

  const needsFocus = settings.mode === "application" && !vm.focusNode;
  const loading = source.loading.get();

  return (
    <ExplorerContext.Provider
      value={{ vm, actions: { openDetails: (selfLink) => showDetails(selfLink), fitView, centerOn } }}
    >
      <ExplorerToolbar namespaces={source.namespaces.get()} onExport={onExport} searchRef={searchRef} />
      <div className={styles.canvas} ref={container} tabIndex={0}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStop={onNodeDragStop}
          onEdgeClick={(_event, edge) => vm.selectEdge(edge.id)}
          onPaneClick={() => {
            vm.select(undefined);
            vm.openContextMenu(undefined);
          }}
          nodesConnectable={false}
          edgesFocusable
          elementsSelectable
          onlyRenderVisibleElements
          minZoom={0.04}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--borderColor)" />
          <Controls showInteractive={false} position="bottom-left" />
          {settings.showMinimap && (
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              nodeColor={(node) =>
                node.type === "band" ? "transparent" : miniMapColor[(node.data as ResourceNodeData).viewNode.health]
              }
              nodeStrokeWidth={0}
              ariaLabel="Overview of the graph"
            />
          )}
        </ReactFlow>
        {needsFocus ? <FocusPicker /> : view.nodes.length === 0 && <EmptyView loading={loading} />}
        <ExplorerInspector />
        <StatusBar source={source} />
        {settings.showLegend && <Legend />}
        <ContextMenu />
      </div>
    </ExplorerContext.Provider>
  );
});

const NonInjectedArchitectureExplorer = observer(
  ({ vm, source, subscribeStores, showDetails, saveFile }: Dependencies) => {
    // Watch the stores while the page is open; custom resources appear later.
    useEffect(() => {
      let unsubscribe: (() => void) | undefined;
      const dispose = reaction(
        () => source.stores.get(),
        (stores) => {
          unsubscribe?.();
          unsubscribe = subscribeStores(stores, { onLoadFailure: () => undefined });
        },
        { fireImmediately: true, equals: sameStores },
      );

      return () => {
        dispose();
        unsubscribe?.();
      };
    }, [source, subscribeStores]);

    return (
      <div className={styles.explorer} data-testid="architecture-explorer">
        <ReactFlowProvider>
          <ExplorerCanvas vm={vm} source={source} saveFile={saveFile} showDetails={showDetails} />
        </ReactFlowProvider>
      </div>
    );
  },
);

export const ArchitectureExplorer = withInjectables<Dependencies>(NonInjectedArchitectureExplorer, {
  getProps: (di, props) => ({
    ...props,
    vm: di.inject(explorerViewModelInjectable),
    source: di.inject(clusterSnapshotSourceInjectable),
    subscribeStores: di.inject(subscribeStoresInjectable),
    showDetails: di.inject(showDetailsInjectable),
    saveFile: di.inject(openSaveFileDialogInjectable),
  }),
});
