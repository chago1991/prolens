# Changelog

All notable changes to ProLens are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and ProLens uses
[semantic versioning](https://semver.org/) for the application version.

The version of the extension API is separate from the application version: it
follows Freelens, so that extensions written for Freelens keep working (see
`docs/prolens/releasing.md`).

## [1.5.0] - 2026-11-19

### Added

- Tabs across the top of the window: one per open cluster, labelled with the
  page open in it (such as "Pods - my-cluster"), and a tab for the welcome
  page. A dot shows whether the cluster is connected. Closing a tab, with its
  button or a middle click, hides the cluster without disconnecting it and
  opens its neighbour.
- Columns of resource lists can be reordered by dragging their headers. The
  order is kept per table, and the column menu resets it.
- Every resource list has a create button, which opens the "Create resource"
  editor with a manifest for the kind and the selected namespace.

### Changed

- Table rows have a faint separator, and links in table cells are underlined.
- The status brick of a container that restarted is no longer outlined in
  orange; restarts show in the Restarts column and the tooltip.

## [1.4.0] - 2026-11-18

### Added

- Gateway API is a group under Network in the cluster sidebar, with an
  overview and pages for gateway classes, gateways, HTTP, gRPC, TCP, TLS and
  UDP routes, reference grants, backend TLS policies and listener sets. A page
  is shown only when API discovery serves the resource, its definition is
  established, and RBAC allows listing it. Versions come from discovery, the
  experimental `XListenerSet` included.
- The overview shows the state, version and channel of every Gateway API
  resource and the controllers of the cluster, with installation guidance
  when the CRDs are missing.
- Detail views for every Gateway API kind: listeners and their status,
  attached routes, parent gateways and the listeners a route attaches to,
  matches, filters, weighted backends, timeouts, reference grants and backend
  TLS policies, with missing backends and cross-namespace references without
  a ReferenceGrant flagged.
- Visual editors for the listeners of gateways and listener sets and for the
  hostnames and rules of HTTP routes. Changes are validated, checked against
  RBAC, confirmed, and applied as a merge patch carrying the resource version;
  targets that look like production require the object name to be typed.
- Creating a Gateway API resource opens a template in the version the
  cluster serves.
- A Gateway API topology: GatewayClass, Gateway, listener, route, Service,
  EndpointSlice and Pod, with backend weights, rejected routes and
  unresolved references highlighted, and live refresh.
- When Cilium is the Gateway API controller, gateways show its load balancer
  Service, CiliumEnvoyConfig, Hubble Relay and Hubble UI.

## [1.3.0] - 2026-11-17

### Added

- GitOps is a group in the cluster sidebar with a page each for the
  dashboard, applications, application sets, projects, and, under Settings,
  repositories and clusters. The dashboard counts apps by state and lists
  those that need attention and the latest syncs. Argo CD repository and
  cluster secrets are read for their URL, type, project and server only.
- GitOps pages filter by namespace and search from the left of their toolbar.

### Changed

- Resource lists show the namespace selector and the search next to their
  title, and the item count at the end of the row.
- The sidebar expands the group of the page that is open, scrolls to its
  item, and outlines it, so the current page is always in sight.

## [1.2.0] - 2026-11-16

### Added

- GitOps view for Argo CD and Flux, in the cluster sidebar when either is
  installed: apps with sync and health, managed resources, drift, history
  and Flux sources; sync, refresh, reconcile, suspend and resume, and Argo CD
  rollback, each after confirmation; links comparing revisions on GitHub,
  GitLab and Bitbucket.

### Security

- An AI assistant's session ends when its terminal tab is closed, and after
  two hours at the latest (was twelve). The token file is deleted as soon as
  it is read.

## [1.1.0] - 2026-11-16

### Added

- Architecture Explorer: an interactive graph of a cluster's resources, under
  **Architecture** in the cluster sidebar and **Explore dependencies** in the
  menu of every resource. It shows what a resource depends on and what
  depends on it, names the likely root cause of a problem with its evidence,
  and marks each relationship as observed, referenced or inferred. Views for
  dependencies, the cluster, a namespace, the network, routing, storage and
  scheduling; search, filters, grouping, draggable nodes, and SVG and PNG
  export. Gateway API resources and Cilium policies are included when their
  CRDs are installed.
- A notice in a resource list while its watch is interrupted.
- `pnpm bench`: benchmarks of the renderer on generated large clusters.

### Changed

- Workload statuses and the workloads overview use indexed pod lookups; on a
  generated cluster of about 40,000 pods, updating the overview went from
  minutes to about a tenth of a second.
- A failed watch is retried with backoff (5 seconds, doubling up to a
  minute) instead of every 5 seconds.
- A single-pod log tab keeps the newest 250,000 lines.
- A store file that is not valid JSON is renamed to
  `<file>.invalid-<timestamp>`, and that store starts from its defaults,
  instead of ProLens failing to start. Stores are written in one atomic write.

### Fixed

- The AI approval gate let Secret reads through the legacy watch paths
  (`/api/v1/watch/...`) pass without approval.

## [1.0.0] - 2026-11-14

First release of ProLens, forked from Freelens at commit `2547f555`.

### Added

- Ask AI: starts a command-line AI assistant (Claude Code, OpenAI Codex CLI,
  Gemini CLI, GitHub Copilot CLI, OpenCode or a custom command) in the
  terminal of a cluster, with a prompt that describes the cluster or the
  selected resource. Available from the top bar, the cluster overview and the
  menu of a resource.
- Approval of AI requests: every launch gets its own token for the cluster's
  proxy. Reads pass; changes, `exec`, `attach`, port forwarding, proxying and
  Secret reads wait for the user's approval of that exact request, and are
  denied after two minutes without an answer.
- Preferences for the AI tools: detection of installed tools, path and
  arguments per tool.
- Theme engine with semantic design tokens and the themes ProLens Dark,
  ProLens Light, Aurora, Graphite, High Contrast, Midnight and Nord; accent
  color, density and font size preferences; custom themes.
- Multi-platform release workflow (`.github/workflows/prolens-release.yml`)
  that builds macOS (arm64, x64), Windows (x64, arm64) and Linux (x64, arm64)
  installers with checksums and build provenance, and creates draft releases.

### Changed

- Name, icons, installer artwork and application id (`app.prolens.ProLens`)
  of ProLens; its settings live in their own `ProLens` directory, so ProLens
  and Freelens can be installed side by side.
- ProLens registers the `prolens://` scheme. `freelens://` links passed to
  ProLens still work, but stay registered to Freelens.
- The update check and "What's new" read the releases of
  `chago1991/prolens`.

### Removed

- The Freelens APT repository configuration and its publishing workflow.
- The Freelens release workflow, replaced by the ProLens one.

[1.3.0]: https://github.com/chago1991/prolens/releases/tag/v1.3.0
[1.2.0]: https://github.com/chago1991/prolens/releases/tag/v1.2.0
[1.1.0]: https://github.com/chago1991/prolens/releases/tag/v1.1.0
[1.0.0]: https://github.com/chago1991/prolens/releases/tag/v1.0.0
