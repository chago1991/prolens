# ProLens Feature Matrix

A snapshot of what ProLens can do, how far each feature is known to work, and
how it compares with Lens, Freelens and Headlamp. It was taken from ProLens
1.0.0 (commit `555c6b3b`) on 2026-11-15 and goes stale as the code changes;
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) explains the method and
[ROADMAP.md](ROADMAP.md) holds the work that follows from it.

## Status and evidence

| Status         | Meaning                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| **Working**    | Exercised in the running application (evidence INT or APP), or fully covered by passing unit tests (UT). |
| **Partial**    | Works, with a known gap that is listed.                                                                  |
| **Broken**     | Does not do what it claims; reproduced.                                                                  |
| **Missing**    | Not implemented (or only declared).                                                                      |
| **Unverified** | Code is present but nothing in this audit exercised it: no test, no run.                                 |

| Evidence | Source                                                                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INT      | Playwright integration tests against the packaged app and a KinD cluster (Kubernetes 1.37), passed in CI on Linux arm64 for PR #4 (`freelens/integration/__tests__/`). "Opens" means the test navigated to the page and found its table. |
| APP      | Exercised by hand in a packaged build during the ProLens UI and release testing (macOS arm64).                                                                                                                                           |
| UT       | Unit tests that pass (`pnpm test:unit`: 5181 passed, 29 skipped).                                                                                                                                                                        |
| —        | Nothing.                                                                                                                                                                                                                                 |

A page that only "opens" in INT is Working as a page; its actions are listed
separately.

## Cluster resource views

All views list, filter, sort, show details in a drawer, edit YAML and delete,
through shared components (`renderer/components/item-object-list/`,
`kube-object-list-layout/`, `kube-object-menu/`). A view is hidden when the
cluster does not serve its API or RBAC denies listing it.

| View                                                        | Status     | Evidence                        | Notes                                                                                               |
| ----------------------------------------------------------- | ---------- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cluster overview (charts, pie charts, issues)               | Partial    | INT opens, UT                   | Charts need Prometheus; chart colours ignore the theme (UI-4). The no-metrics link test is skipped. |
| Nodes                                                       | Working    | INT opens, UT                   |                                                                                                     |
| Workloads overview                                          | Working    | INT opens, UT                   |                                                                                                     |
| Pods                                                        | Working    | INT opens + create/delete, UT   | Created from a template and deleted from its menu in INT.                                           |
| Deployments, StatefulSets, ReplicaSets                      | Working    | INT opens, UT                   | Scale dialogs unit-tested.                                                                          |
| DaemonSets, Jobs, CronJobs                                  | Working    | INT opens, UT (stores, metrics) |                                                                                                     |
| ReplicationControllers                                      | Unverified | —                               | No test, not in INT.                                                                                |
| ConfigMaps, ResourceQuotas, LimitRanges                     | Working    | INT opens                       | No unit tests.                                                                                      |
| Secrets                                                     | Working    | INT opens, UT                   | Includes TLS certificate details.                                                                   |
| HorizontalPodAutoscalers, PodDisruptionBudgets              | Working    | INT opens, UT                   |                                                                                                     |
| VerticalPodAutoscalers, PriorityClasses, Leases             | Unverified | —                               | No test, not in INT.                                                                                |
| RuntimeClasses                                              | Working    | UT                              | Not in INT.                                                                                         |
| Validating/Mutating webhook configurations                  | Working    | INT opens, UT                   |                                                                                                     |
| Validating/Mutating admission policies and bindings         | Working    | INT opens, UT                   |                                                                                                     |
| Services, Endpoints, Ingresses, NetworkPolicies             | Working    | INT opens, UT (most)            | Services has no unit test.                                                                          |
| EndpointSlices, IngressClasses                              | Unverified | —                               | No test, not in INT.                                                                                |
| Port forwards (list)                                        | Partial    | UT (main side only)             | No renderer test; not in INT.                                                                       |
| PersistentVolumeClaims, PersistentVolumes, StorageClasses   | Working    | INT opens, UT (PVC)             |                                                                                                     |
| Namespaces                                                  | Working    | INT opens + create, UT          | 7 skipped tests in `edit-namespace-from-new-tab.test.tsx`.                                          |
| Events                                                      | Working    | INT opens, UT                   | Limited to 1000 objects.                                                                            |
| Helm charts, Helm releases                                  | Working    | INT opens, UT                   |                                                                                                     |
| ServiceAccounts, Roles, ClusterRoles, (Cluster)RoleBindings | Working    | INT opens, UT (bindings)        |                                                                                                     |
| PodSecurityPolicies                                         | Unverified | —                               | Legacy: shown only for clusters that still serve `policy/podsecuritypolicies` (before 1.25).        |
| CustomResourceDefinitions, custom resources                 | Working    | INT opens, UT                   |                                                                                                     |
| Gateway API (Gateway, HTTPRoute, …)                         | Partial    | UT (as CRD fixtures)            | Only as generic custom resources; no dedicated views (FEAT-3).                                      |

## Resource actions

| Action                                             | Status     | Evidence  | Notes                                                          |
| -------------------------------------------------- | ---------- | --------- | -------------------------------------------------------------- |
| Edit YAML (dock editor)                            | Working    | UT        |                                                                |
| Create from templates                              | Working    | INT       | A pod is created in INT; the tab has no unit test.             |
| Delete                                             | Working    | INT, UT   |                                                                |
| Force delete, force finalize                       | Unverified | —         |                                                                |
| Scale (Deployment, StatefulSet, ReplicaSet)        | Working    | UT        |                                                                |
| Restart (Deployment, StatefulSet, DaemonSet)       | Unverified | —         |                                                                |
| CronJob trigger/suspend/resume, Job suspend/resume | Unverified | —         |                                                                |
| Node shell, cordon, uncordon, drain                | Working    | UT        |                                                                |
| Pod shell (exec), attach                           | Working    | UT, APP   | Exec exercised through the AI approval tests.                  |
| Pod logs, workload logs, download logs             | Partial    | UT, APP   | Single-pod tabs keep the newest 250,000 lines (PERF-1, fixed). |
| Port forward (dialog, open in browser)             | Partial    | UT (main) | Dialog and store untested.                                     |
| Helm install, upgrade                              | Working    | UT        |                                                                |
| Helm rollback, uninstall                           | Unverified | —         |                                                                |
| Service account → kubeconfig                       | Unverified | —         |                                                                |
| kubectl apply (resource applier)                   | Working    | UT        |                                                                |

## Application

| Feature                                                                            | Status     | Evidence        | Notes                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ---------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Welcome page with ProLens branding                                                 | Working    | APP, UT         |                                                                                                                                                        |
| Catalog (browse, details, custom columns)                                          | Working    | INT, UT         |                                                                                                                                                        |
| Kubeconfig sync (files and folders)                                                | Partial    | INT, UT         | `compute-diff.injectable.ts` notes that a changed config is not detected as an update.                                                                 |
| Add cluster (paste kubeconfig)                                                     | Unverified | UT (navigation) |                                                                                                                                                        |
| Cluster settings (name, icon, proxy, metrics, namespaces, terminal, node shell)    | Working    | UT              | Icon and local terminal settings tested; others not.                                                                                                   |
| Hotbar (multiple hotbars, drag and drop, auto-hide)                                | Working    | UT              | Hover test skipped.                                                                                                                                    |
| Command palette                                                                    | Working    | INT, UT         |                                                                                                                                                        |
| Keyboard shortcuts                                                                 | Partial    | UT              | Menu accelerators work; the shortcut framework (`packages/business-features/keyboard-shortcuts`) has no registered shortcut and none are configurable. |
| Application menu, tray                                                             | Working    | UT              |                                                                                                                                                        |
| `prolens://` deep links                                                            | Working    | UT, APP         | The command-line path lowercases the whole URL (BUG-2, inherited).                                                                                     |
| Integrated terminal (local, per cluster, standalone page)                          | Working    | APP, UT         |                                                                                                                                                        |
| Metrics with Prometheus (lens, helm, operator, stacklight, openshift, auto-detect) | Unverified | UT (main side)  | No cluster with Prometheus was used; provider queries have no tests.                                                                                   |
| Update check (notification and About)                                              | Working    | UT, APP         | Reads `chago1991/prolens` releases; logs and gives up when GitHub rate-limits it.                                                                      |
| Automatic update                                                                   | Missing    | —               | Deliberately off until builds are signed (FEAT-8).                                                                                                     |
| Error reporting                                                                    | Missing    | —               | `allowErrorReporting` is stored but has no UI and no consumer (CLEAN-3).                                                                               |
| Localisation                                                                       | Missing    | —               | English only.                                                                                                                                          |

## Preferences and customisation

| Feature                                               | Status     | Evidence             | Notes                                                                                                |
| ----------------------------------------------------- | ---------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| Theme gallery: 7 ProLens themes, 2 classic, System    | Partial    | APP, UT              | White text on the accent fails contrast on High Contrast, Nord and Graphite (A11Y-1).                |
| Accent colour, density, UI font size                  | Partial    | APP, UT              | Compact density reaches only spacing that uses CSS variables (UI-6); some text has fixed sizes.      |
| Custom themes (JSON import/export)                    | Working    | UT                   | Not exercised in the app.                                                                            |
| Persistence across restarts                           | Working    | APP                  |                                                                                                      |
| Terminal: shell, font, size, theme, copy on select    | Working    | UT                   | Terminal theme has no test.                                                                          |
| Editor: font, size, tab size, line numbers, minimap   | Unverified | UT (navigation only) | Editor (Monaco) themes do not follow the ProLens palettes (UI-5).                                    |
| Sidebar width and menu order                          | Working    | UT                   |                                                                                                      |
| Table column visibility, widths, sort                 | Working    | UT                   | No column reordering.                                                                                |
| Dashboard layout                                      | Missing    | —                    | Overview blocks cannot be chosen or arranged (FEAT-6).                                               |
| Kubernetes: kubectl/helm paths, download mirror, sync | Working    | UT                   | `helmServerSide` has no test.                                                                        |
| Proxy, untrusted certificates                         | Working    | UT                   |                                                                                                      |
| Start at login, tray icon                             | Unverified | —                    | A test launch of the ad-hoc signed build logged "Unable to set login item: Operation not permitted". |
| Extension registry URL                                | Unverified | —                    |                                                                                                      |

## Extensions

| Feature                                            | Status  | Evidence | Notes                                                                  |
| -------------------------------------------------- | ------- | -------- | ---------------------------------------------------------------------- |
| Install from folder, run renderer and main entries | Working | INT, UT  | Fixture extension in INT.                                              |
| Install from registry, URL, file, deep link        | Working | UT       | Checksum verified when published; missing checksum only warns (SEC-9). |
| Freelens v2 extensions                             | Working | INT, UT  | Extension API version stays on 2.x.                                    |
| Freelens/OpenLens v1 extensions                    | Missing | —        | Not supported by Freelens v2 either.                                   |

## Architecture Explorer (ProLens)

| Feature                                                                                                                                            | Status  | Evidence | Notes                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- | ------------------------------------------------------------------------ |
| Graph of a cluster's resources, from owner references, selectors, EndpointSlices and spec references, each marked observed, referenced or inferred | Working | UT       | Not yet checked against a real cluster in the app.                       |
| Views: dependencies, cluster, namespace, network, routing, storage, scheduling                                                                     | Working | UT       |                                                                          |
| Root cause and impact of a resource, with evidence and path                                                                                        | Working | UT       | Heuristic: a problem whose own dependencies have none.                   |
| Gateway API and Cilium policies                                                                                                                    | Working | UT       | Read only when their CRDs are installed.                                 |
| Search, filters, grouping, aggregation, collapse, drag with saved positions, context menu, inspector                                               | Working | UT       | Component test in jsdom; drag and zoom were not exercised.               |
| SVG and PNG export                                                                                                                                 | Partial | UT       | SVG covered by tests; PNG uses the browser canvas and was not exercised. |
| Live traffic (Hubble flows), several clusters in one graph                                                                                         | Missing | —        |                                                                          |

## AI assistants (ProLens)

| Feature                                                            | Status     | Evidence | Notes                                                                                    |
| ------------------------------------------------------------------ | ---------- | -------- | ---------------------------------------------------------------------------------------- |
| Tool detection and settings (6 providers)                          | Working    | APP, UT  |                                                                                          |
| Ask AI from top bar, overview, resource menu, events, logs, editor | Working    | APP, UT  | Prompt carries cluster context; Secret values redacted.                                  |
| Claude Code in the cluster terminal                                | Working    | APP      | macOS; its delete was held for approval and denied.                                      |
| OpenAI Codex CLI                                                   | Partial    | APP      | Launches with the prompt; kubectl not exercised (account rejected the configured model). |
| Gemini CLI, Copilot CLI, OpenCode, custom command                  | Unverified | UT       |                                                                                          |
| Approval of writes, exec/attach/port-forward, Secret reads         | Working    | APP, UT  | Normal paths checked in the app; legacy watch paths (SEC-1, fixed) by unit tests only.   |
| Session ends when the tool exits                                   | Missing    | —        | Sessions stay valid for 12 hours (SEC-2).                                                |
| AI on Windows and Linux                                            | Unverified | UT       |                                                                                          |
| API backends (Ollama, OpenAI-compatible) and MCP servers           | Missing    | —        | Interfaces declared in `features/ai-tools/common/ai-tools.ts` only.                      |

## Packaging and distribution

| Feature                                  | Status     | Evidence | Notes                                                                                  |
| ---------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------- |
| macOS arm64 and x64 (DMG, ZIP)           | Working    | CI, APP  | Ad-hoc signed; the arm64 DMG was installed and started. x64 not started.               |
| Windows x64 and arm64 (NSIS)             | Unverified | CI       | Built and architecture-checked in CI; never installed. Unsigned.                       |
| Linux x64 and arm64 (AppImage, DEB, RPM) | Unverified | CI       | Built and architecture-checked; never installed. AppImage runs `--no-sandbox` (SEC-6). |
| Checksums and build provenance           | Working    | CI, APP  | `gh attestation verify` checked on a downloaded RPM.                                   |
| Code signing and notarization            | Missing    | —        | Needs certificates (REL-1).                                                            |
| Side-by-side install with Freelens       | Working    | APP      | Separate app id, protocol and user data.                                               |

## Compared with other Kubernetes desktop tools

From each project's documentation and releases, checked on 2026-11-15. The
sources are listed below the table. "Unverified" means the source did not
settle it.

| Capability                       | ProLens 1.0                                                             | Lens (Mirantis)                                             | Freelens 2.0                                                              | Headlamp                                        |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Licence, account                 | MIT, no account                                                         | Proprietary, Lens ID login, paid above $10M revenue         | MIT, no account                                                           | Apache-2.0, no account                          |
| Runs as a web app in the cluster | No                                                                      | No                                                          | No                                                                        | Yes                                             |
| Metrics                          | Prometheus providers                                                    | Lens Metrics stack, several providers                       | Prometheus providers                                                      | Prometheus plugin                               |
| Helm                             | Charts and releases                                                     | Yes                                                         | Yes                                                                       | Plugin                                          |
| Extensions                       | Freelens v2 API                                                         | Own marketplace (paid tiers)                                | v2 API (breaks v1)                                                        | Own plugin API and catalog                      |
| AI assistant                     | CLI assistants in the terminal, per-request approval of cluster changes | Lens Prism / Ask AI (paid), MCP server with read-only tools | Through extensions only                                                   | AI Assistant plugin (alpha), asks before writes |
| Themes                           | 9 built in, custom JSON, accent, density, font                          | Dark, light, system                                         | Light, dark, system; theme extensions                                     | Light, dark, branding, plugin themes            |
| RBAC-aware UI, OIDC              | Hides views RBAC denies; OIDC through kubeconfig only                   | Enterprise SSO, Teamwork                                    | Like ProLens                                                              | RBAC-adaptive UI, in-cluster OIDC               |
| Topology / resource map          | No                                                                      | Unverified                                                  | No                                                                        | Yes                                             |
| Gateway API views                | Generic custom resources                                                | Yes                                                         | Unverified                                                                | Yes (map)                                       |
| Security scanning (CVEs)         | No                                                                      | Security Center (Trivy)                                     | No                                                                        | Plugins                                         |
| Automatic update                 | No (notification only)                                                  | Yes, with channels                                          | Through package managers                                                  | Update check                                    |
| Signed installers                | No                                                                      | Yes                                                         | Yes, per its release workflow (Apple notarization, Azure Trusted Signing) | Partly (Windows unsigned)                       |

Sources: [lenshq.io pricing](https://lenshq.io/pricing),
[Lens docs](https://docs.lenshq.io/), [Lens MCP server](https://docs.lenshq.io/k8slens/mcp-server/),
[Freelens README](https://github.com/freelensapp/freelens),
[Freelens v2.0.0](https://github.com/freelensapp/freelens/releases/tag/v2.0.0),
[Headlamp](https://headlamp.dev/), [Headlamp docs](https://headlamp.dev/docs/latest/),
[Headlamp AI Assistant](https://github.com/headlamp-k8s/plugins/tree/main/ai-assistant),
[Headlamp in 2025](https://kubernetes.io/blog/2026/01/22/headlamp-in-2025-project-highlights/).
OpenLens is no longer maintained (the [lensapp/lens](https://github.com/lensapp/lens)
README calls the open-source project retired), so it is not a column; its
capabilities are those of Freelens 1.x.
