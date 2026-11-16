/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { analyze } from "../analyze";
import { buildArchitectureGraph, nodeId } from "../build-graph";
import { renderSvg } from "../export-svg";
import { layoutView, nodeSize } from "../layout";
import { defaultHiddenKinds, defaultViewOptions, selectView } from "../views";
import { deploymentWithPods, object, resetUids, snapshot } from "./fixtures";

import type { ExportPalette } from "../export-svg";
import type { ViewOptions } from "../views";

const id = (kind: string, name: string, namespace: string | undefined = "shop", group = "") =>
  nodeId(group, kind, namespace, name);
const readyNode = (name: string) =>
  object("Node", "v1", name, { namespace: null, status: { conditions: [{ type: "Ready", status: "True" }] } });
const options = (overrides: Partial<ViewOptions> = {}): ViewOptions => ({ ...defaultViewOptions, ...overrides });

const shop = () => {
  const web = deploymentWithPods("web", { pods: 3, node: "node-1" });
  const db = deploymentWithPods("db", { pods: 1, node: "node-2", namespace: "data" });

  return buildArchitectureGraph(
    snapshot([
      readyNode("node-1"),
      readyNode("node-2"),
      ...web.all,
      ...db.all,
      object("Service", "v1", "web", { spec: { selector: { app: "web" } } }),
      object("ServiceAccount", "v1", "default"),
      object("ServiceAccount", "v1", "default", { namespace: "data" }),
    ]),
  );
};

describe("selectView", () => {
  beforeEach(() => resetUids());

  it("aggregates the pods of one owner into one node and merges their edges", () => {
    const view = selectView(shop(), options({ hiddenKinds: defaultHiddenKinds("cluster") }));
    const aggregate = view.nodes.find((node) => node.type === "aggregate");

    expect(aggregate).toMatchObject({
      label: "3 pods",
      members: [id("Pod", "web-abc-0"), id("Pod", "web-abc-1"), id("Pod", "web-abc-2")],
    });
    expect(view.edges.find((edge) => edge.relation === "selects")).toMatchObject({ target: aggregate?.id, count: 3 });
    expect(view.edges.filter((edge) => edge.relation === "runs-on" && edge.source === aggregate?.id)).toHaveLength(1);
  });

  it("shows the pods of an expanded aggregate one by one", () => {
    const view = selectView(
      shop(),
      options({
        hiddenKinds: defaultHiddenKinds("cluster"),
        expanded: new Set([`agg|${id("ReplicaSet", "web-abc", "shop", "apps")}`]),
      }),
    );

    expect(
      view.nodes.filter((node) => node.kind === "Pod" && node.node.namespace === "shop").map((node) => node.label),
    ).toEqual(["web-abc-0", "web-abc-1", "web-abc-2"]);
  });

  it("hides inactive ReplicaSets unless asked", () => {
    const graph = buildArchitectureGraph(
      snapshot([object("ReplicaSet", "apps/v1", "old", { spec: { replicas: 0 }, status: {} })]),
    );

    expect(selectView(graph, options()).nodes).toHaveLength(0);
    expect(selectView(graph, options({ hideInactiveReplicaSets: false })).nodes.map((node) => node.kind)).toContain(
      "ReplicaSet",
    );
  });

  it("connects workloads to their pods when the ReplicaSets between them are hidden", () => {
    const view = selectView(shop(), options({ mode: "scheduling", groupBy: "node", aggregatePods: false }));
    const bridged = view.edges.filter((edge) => edge.bridged);

    expect(view.nodes.some((node) => node.kind === "ReplicaSet")).toBe(false);
    expect(bridged.map((edge) => [edge.source, edge.target])).toContainEqual([
      id("Deployment", "web", "shop", "apps"),
      id("Pod", "web-abc-0"),
    ]);
    expect(bridged[0].evidence).toBe("owner chain through ReplicaSet web-abc");
  });

  it("groups the scheduling view by node", () => {
    const view = selectView(shop(), options({ mode: "scheduling", groupBy: "node", aggregatePods: false }));
    const groupOf = (name: string) => view.nodes.find((node) => node.label === name)?.group;

    expect(groupOf("web-abc-0")).toBe("node-1");
    expect(groupOf("db-abc-0")).toBe("node-2");
    expect(groupOf("node-1")).toBe("node-1");
  });

  it("limits the namespace view to one namespace and its cluster-scoped neighbours", () => {
    const view = selectView(
      shop(),
      options({ mode: "namespace", namespace: "data", groupBy: "none", aggregatePods: false }),
    );

    expect(view.nodes.map((node) => node.label).sort()).toEqual(["db", "db-abc", "db-abc-0", "default", "node-2"]);
  });

  it("shows only the dependencies and impact of the focus in the dependency view", () => {
    const graph = shop();
    const analysis = analyze(graph, id("Service", "web"));
    const view = selectView(graph, options({ mode: "application", analysis, groupBy: "none" }));

    expect(view.nodes.every((node) => node.node.namespace !== "data")).toBe(true);
    expect(view.nodes.find((node) => node.id === id("Service", "web"))?.role).toBe("focus");
    expect(view.edges.some((edge) => edge.role === "dependency")).toBe(true);
  });

  it("keeps problems and their neighbours when only problems are shown", () => {
    const graph = buildArchitectureGraph(
      snapshot([
        ...deploymentWithPods("ok", { pods: 1 }).all,
        object("Service", "v1", "broken", { spec: { selector: { app: "nothing" } } }),
        readyNode("node-1"),
      ]),
    );

    expect(selectView(graph, options({ problemsOnly: true, groupBy: "none" })).nodes.map((node) => node.label)).toEqual(
      ["broken"],
    );
  });

  it("marks search matches by name, kind or label", () => {
    expect(selectView(shop(), options({ search: "db" })).matches).toEqual(
      expect.arrayContaining([id("Deployment", "db", "data", "apps")]),
    );
    expect(selectView(shop(), options({ search: "service web" })).matches).toEqual([id("Service", "web")]);
    expect(
      selectView(shop(), options({ search: "app=db", aggregatePods: false }))
        .matches.slice()
        .sort(),
    ).toEqual(
      [
        id("Deployment", "db", "data", "apps"),
        id("ReplicaSet", "db-abc", "data", "apps"),
        id("Pod", "db-abc-0", "data"),
      ].sort(),
    );
  });

  it("collapses a group into one node", () => {
    const view = selectView(shop(), options({ collapsedGroups: new Set(["data"]) }));
    const group = view.nodes.find((node) => node.type === "group");

    expect(group).toMatchObject({ label: expect.stringMatching(/^data: \d+ resources$/) });
    expect(view.nodes.filter((node) => node.node.namespace === "data" && node.type !== "group")).toHaveLength(0);
  });

  it("drops the least important nodes beyond the limit and says how many", () => {
    const view = selectView(shop(), options({ maxNodes: 3, aggregatePods: false }));

    expect(view.nodes).toHaveLength(3);
    expect(view.truncated).toBe(view.total - 3);
  });
});

describe("layoutView", () => {
  beforeEach(() => resetUids());

  it("places nodes in columns by kind without overlaps, and is deterministic", () => {
    const view = selectView(shop(), options({ aggregatePods: false }));
    const first = layoutView(view, { direction: "LR", spacing: "comfortable" });
    const second = layoutView(view, { direction: "LR", spacing: "comfortable" });
    const positions = [...first.positions.values()];

    expect([...second.positions]).toEqual([...first.positions]);
    expect(first.positions.size).toBe(view.nodes.length);

    for (let a = 0; a < positions.length; a += 1) {
      for (let b = a + 1; b < positions.length; b += 1) {
        const overlap =
          Math.abs(positions[a].x - positions[b].x) < nodeSize.width &&
          Math.abs(positions[a].y - positions[b].y) < nodeSize.height;

        expect(overlap).toBe(false);
      }
    }

    const x = (label: string) =>
      first.positions.get(view.nodes.find((node) => node.label === label)?.id ?? "")?.x ?? -1;

    expect(x("web")).toBeLessThan(x("web-abc"));
    expect(x("web-abc")).toBeLessThan(x("web-abc-0"));
    expect(x("web-abc-0")).toBeLessThan(x("node-1"));
  });

  it("keeps the positions the user pinned", () => {
    const view = selectView(shop(), options());
    const pinnedId = view.nodes[0].id;
    const layout = layoutView(view, {
      direction: "TB",
      spacing: "compact",
      pinned: new Map([[pinnedId, { x: 5, y: 7 }]]),
    });

    expect(layout.positions.get(pinnedId)).toEqual({ x: 5, y: 7 });
  });

  it("lays out a large view quickly", () => {
    const objects = [readyNode("node-1")];

    for (let index = 0; index < 400; index += 1) {
      objects.push(...deploymentWithPods(`app-${index}`, { pods: 5, namespace: `ns-${index % 20}` }).all);
    }

    const graph = buildArchitectureGraph(snapshot(objects));
    const start = performance.now();
    const view = selectView(graph, options({ aggregatePods: false, maxNodes: 5000 }));
    const layout = layoutView(view, { direction: "LR", spacing: "comfortable" });

    expect(layout.positions.size).toBe(view.nodes.length);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("renderSvg", () => {
  beforeEach(() => resetUids());

  const palette: ExportPalette = {
    background: "#000",
    surface: "#111",
    border: "#222",
    text: "#fff",
    textMuted: "#aaa",
    accent: "#0af",
    health: { healthy: "#0f0", warning: "#fa0", critical: "#f00", unknown: "#888", missing: "#f0f" },
  };

  it("draws every node and edge of the view, escaping names", () => {
    const graph = buildArchitectureGraph(
      snapshot([
        object("ConfigMap", "v1", "a<b>&c"),
        object("Pod", "v1", "p", { spec: { volumes: [{ name: "v", configMap: { name: "a<b>&c" } }] } }),
      ]),
    );
    const view = selectView(graph, options({ groupBy: "none" }));
    const svg = renderSvg(view, layoutView(view, { direction: "LR", spacing: "compact" }), "LR", palette);

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("a&lt;b&gt;&amp;c");
    expect(svg.match(/<g class="node">/g)).toHaveLength(view.nodes.length);
    expect(svg.match(/<path /g)).toHaveLength(view.edges.length);
    expect(svg).toContain('stroke-dasharray="6 4"');
  });
});
