/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Benchmarks of the architecture explorer on generated clusters. They run
 * only with PROLENS_BENCH=1 (`pnpm bench`), because they take a while.
 */

import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "../analyze";
import { buildArchitectureGraph, nodeId } from "../build-graph";
import { layoutView } from "../layout";
import { defaultHiddenKinds, defaultViewOptions, selectView } from "../views";
import { deploymentWithPods, object, snapshot } from "./fixtures";

import type { ResourceObject } from "../types";

const enabled = process.env.PROLENS_BENCH === "1";

const sizes = [
  { name: "medium", namespaces: 50, nodes: 50, apps: 1_000, pods: 5 },
  { name: "large", namespaces: 200, nodes: 500, apps: 5_000, pods: 5 },
];

const generate = ({ namespaces, nodes, apps, pods }: (typeof sizes)[number]) => {
  const objects: ResourceObject[] = [];

  for (let index = 0; index < nodes; index += 1) {
    objects.push(
      object("Node", "v1", `node-${index}`, {
        namespace: null,
        status: { conditions: [{ type: "Ready", status: "True" }] },
      }),
    );
  }

  for (let index = 0; index < namespaces; index += 1) {
    objects.push(object("ServiceAccount", "v1", "default", { namespace: `ns-${index}` }));
  }

  for (let index = 0; index < apps; index += 1) {
    const namespace = `ns-${index % namespaces}`;
    const name = `app-${index}`;

    objects.push(
      ...deploymentWithPods(name, {
        namespace,
        pods,
        node: `node-${index % nodes}`,
        podSpec: {
          volumes: [{ name: "config", configMap: { name: `${name}-config` } }],
          containers: [{ name: "app", envFrom: [{ secretRef: { name: `${name}-secret` } }] }],
        },
      }).all,
      object("Service", "v1", name, { namespace, spec: { selector: { app: name } } }),
      object("ConfigMap", "v1", `${name}-config`, { namespace }),
      object("Secret", "v1", `${name}-secret`, { namespace }),
    );
  }

  return objects;
};

const median = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

const time = (runs: number, run: () => unknown) => {
  const samples: number[] = [];

  for (let index = 0; index < runs; index += 1) {
    const start = performance.now();

    run();
    samples.push(performance.now() - start);
  }

  return median(samples);
};

describe.skipIf(!enabled)("architecture explorer benchmarks", () => {
  it("builds, analyzes and lays out generated clusters", () => {
    const rows: string[] = [];

    for (const size of sizes) {
      const objects = generate(size);
      const input = snapshot(objects);
      const runs = size.name === "large" ? 3 : 7;
      const graph = buildArchitectureGraph(input);
      const focus = nodeId("", "Service", "ns-0", "app-0");
      const cluster = { ...defaultViewOptions, hiddenKinds: defaultHiddenKinds("cluster") };
      const clusterView = selectView(graph, cluster);
      const namespaceOptions = {
        ...defaultViewOptions,
        mode: "namespace" as const,
        namespace: "ns-0",
        groupBy: "none" as const,
      };
      const namespaceView = selectView(graph, namespaceOptions);
      const analysis = analyze(graph, focus);
      const dependencyView = selectView(graph, {
        ...defaultViewOptions,
        mode: "application",
        analysis,
        groupBy: "none",
      });

      expect(analysis.dependencies.size).toBeGreaterThan(5);

      const measurements: [string, number, string][] = [
        [
          "Build the graph from every object",
          time(runs, () => buildArchitectureGraph(input)),
          `${graph.nodes.size} nodes, ${graph.edges.length} edges`,
        ],
        [
          "Analyze one Service (root cause and impact)",
          time(runs, () => analyze(graph, focus)),
          `${analysis.dependencies.size} dependencies`,
        ],
        [
          "Cluster view, pods aggregated, capped",
          time(runs, () => selectView(graph, cluster)),
          `${clusterView.nodes.length} of ${clusterView.total} shown`,
        ],
        [
          "Lay out the cluster view",
          time(runs, () => layoutView(clusterView, { direction: "LR", spacing: "comfortable" })),
          "",
        ],
        [
          "Namespace view",
          time(runs, () => selectView(graph, namespaceOptions)),
          `${namespaceView.nodes.length} nodes`,
        ],
        [
          "Dependency view and its layout",
          time(runs, () =>
            layoutView(selectView(graph, { ...defaultViewOptions, mode: "application", analysis, groupBy: "none" }), {
              direction: "LR",
              spacing: "comfortable",
            }),
          ),
          `${dependencyView.nodes.length} nodes`,
        ],
      ];

      for (const [scenario, ms, note] of measurements) {
        rows.push(`| ${size.name} (${objects.length} objects) | ${scenario} | ${ms.toFixed(1)} | ${note} |`);
      }
    }

    const table = ["| Size | Scenario | Median, ms | Size of the result |", "| --- | --- | ---: | --- |", ...rows].join(
      "\n",
    );
    const output = process.env.PROLENS_BENCH_OUT;

    if (output) {
      writeFileSync(output.replace(/(\.md)?$/, "-explorer.md"), `${table}\n`);
    }

    console.log(`\n${table}`);
  }, 3_600_000);
});
