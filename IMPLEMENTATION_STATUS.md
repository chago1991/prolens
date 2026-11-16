# ProLens Implementation Status

The state of ProLens 1.0.0 (commit `555c6b3b`, released as `v1.0.0`) as found
by an audit on 2026-11-15. It is a snapshot. The feature-by-feature view is
[FEATURE_MATRIX.md](FEATURE_MATRIX.md), the backlog with acceptance criteria is
[ROADMAP.md](ROADMAP.md), and the structure of the code is
[ARCHITECTURE.md](ARCHITECTURE.md).
[PROLENS_IMPLEMENTATION_PLAN.md](PROLENS_IMPLEMENTATION_PLAN.md) records how the
ProLens changes were made.

## How the audit was done

- **Code inspection.** The whole repository was read for architecture, IPC,
  features, settings, themes, accessibility, security, performance, tests and
  packaging. Claims that decide a priority were checked again by hand: the
  window settings, the CSP, the DI generator, the AI request classifier (run
  against real paths), the log line limit, session revocation, the unused
  `onAccent` token, the keyboard-shortcut framework and the deep-link parser.
- **Evidence of behaviour**, nothing else counts as "working":
  - the unit tests (`pnpm test:unit`): 488 files, 5181 tests passed, 29 skipped;
  - the integration tests against a KinD cluster in CI (Linux arm64, PR #4);
  - hand testing of the packaged macOS application during the ProLens work;
  - the release pipeline (six platform builds, checksums, provenance).
- **Comparison.** Lens, Freelens and Headlamp from their own documentation and
  releases; sources are in FEATURE_MATRIX.md.
- Nothing was changed in the application during the audit.

## Summary

| Area                       | Working | Partial | Broken | Missing | Unverified |
| -------------------------- | ------- | ------- | ------ | ------- | ---------- |
| Cluster resource views     | 18      | 3       | 0      | 0       | 4          |
| Resource actions           | 8       | 2       | 0      | 0       | 5          |
| Application                | 9       | 2       | 0      | 3       | 2          |
| Preferences, customisation | 7       | 2       | 0      | 1       | 3          |
| Extensions                 | 3       | 0       | 0      | 1       | 0          |
| AI assistants              | 3       | 1       | 1      | 2       | 2          |
| Packaging and distribution | 3       | 0       | 0      | 1       | 2          |

Counts are rows of FEATURE_MATRIX.md; a row can stand for several views.

What this means:

- **The inherited Kubernetes IDE works.** The common cluster pages open
  against a real cluster in CI; creating and deleting objects, the command
  palette, preferences and extension installation are exercised end to end.
  The unit suite is large and passes.
- **The ProLens additions work on macOS, with one security defect.** The AI
  approval gate holds writes, exec and Secret reads, including through the legacy watch paths (SEC-1, fixed).
  Sessions end with their terminal tab (SEC-2, fixed).
- **One accessibility defect in the theme engine.** White text on the accent
  colour fails contrast on several themes (A11Y-1, P0).
- **Installers are built for all six platforms but signed nowhere**, and only
  the macOS arm64 build was installed and started.

## Findings by area

### Security

| Finding                                                                   | Severity           | Evidence                                               | Backlog      |
| ------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------ | ------------ |
| Fixed: Secret reads through `/api/v1/watch/...` passed the AI gate        | High               | Watch paths now parsed; unit and proxy tests           | SEC-1        |
| Fixed: AI sessions outlived the assistant (now revoked on tab close, 2 h) | Medium             | No caller outside tests                                | SEC-2        |
| Renderer has Node integration, no context isolation, no preload           | High (inherited)   | `create-electron-window.injectable.ts`                 | ARCH-3       |
| CSP without `default-src`/`object-src`/`base-uri`, with `'unsafe-eval'`   | Medium (inherited) | `freelens/package.json` `config.contentSecurityPolicy` | SEC-5        |
| No Electron fuses                                                         | Medium             | No fuse configuration in `electron-builder.yml`        | SEC-4        |
| AI launch directory in the shared temp folder not checked for ownership   | Medium             | `prepare-ai-launch.injectable.ts`                      | SEC-3        |
| Extensions without a published checksum install after a warning           | Medium (inherited) | `installer/common/checksums.ts`                        | SEC-9        |
| AppImage runs without the Chromium sandbox                                | Medium (inherited) | `electron-builder.yml` `appImage.executableArgs`       | SEC-6        |
| Actions pinned by tag; no SBOM or vulnerability scan of ProLens releases  | Medium             | Workflows; scan jobs limited to `freelensapp`          | SEC-7, SEC-8 |
| Deep links lowercased on the command-line path                            | Low (inherited)    | `setup-deep-linking.injectable.ts`                     | BUG-2        |

What holds up: the local proxy accepts only its own host names and origins,
requires a per-run token compared in constant time, and strips it before
forwarding; the proxy certificate is generated in memory and pinned by the
session; bundled and downloaded binaries are verified against pinned digests;
external links open only for http and https; no `eval`, remote module or
`pull_request_target`.

### Performance

- Lists load every object of a kind in one request, with watch events applied
  in one-second batches; very large clusters are not paginated (FEAT-9).
- Lists are virtualised (react-window); log tabs too. Single-pod tabs keep at
  most 250,000 lines (PERF-1, fixed).
- Pod lookups by owner, node and namespace are indexed; failed watches retry
  with backoff and show a notice in the list. See `docs/prolens/performance.md`.

#### Benchmark results

`pnpm bench`, Apple M4, 16 GB, Node 24. Medians of 7 runs (medium) and 3 runs
(large); the full-scan code at the large size ran once. Medium: 1,000
Deployments, about 6,600 pods. Large: 5,000 Deployments, about 40,000 pods.

| Size   | Scenario                                       | Full scan, ms | Indexed, ms | Speedup |
| ------ | ---------------------------------------------- | ------------: | ----------: | ------: |
| medium | Workloads overview: update after a pod changes |         1,267 |        18.7 |     68× |
| medium | ReplicaSet statuses, all namespaces            |         1,528 |         1.8 |    837× |
| medium | Pods of a node, 20 lookups                     |           2.2 |       < 0.1 |    679× |
| medium | Pods in half of the namespaces                 |           0.8 |         0.3 |      3× |
| medium | Watch flush: 5,000 MODIFIED events (unchanged) |             — |        88.4 |       — |
| large  | Workloads overview: update after a pod changes |       228,546 |         127 |  1,800× |
| large  | ReplicaSet statuses, all namespaces            |       303,772 |        18.1 | 16,764× |
| large  | Pods of a node, 20 lookups                     |          47.9 |       < 0.1 | 21,713× |
| large  | Pods in half of the namespaces                 |          18.8 |        11.5 |      2× |
| large  | Watch flush: 5,000 MODIFIED events (unchanged) |             — |        94.3 |       — |

Renderer bundle (`index-*.js`, production build): 22,573 kB without the
side-effect-free marking of `@kubernetes/client-node`, 22,464 kB with it
(−109 kB, 0.5%).

- Polling: pod metrics every 10 s, node metrics 30 s, cluster metrics every
  minute, cluster refresh 30 s in main. Timers are cleared through disposers;
  more event listeners are added than removed in the code, which was not
  examined case by case.

#### Lens Plus parity: progress

| Area                                                                     | State                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI assistant                                                             | CLI assistants with per-request approval; sessions end with their terminal (SEC-2 fixed). Ollama/OpenAI API backends and MCP: missing.                                                                                                        |
| GitOps                                                                   | Argo CD Applications and Flux Kustomizations/HelmReleases: list, status, managed resources, drift, history, sync/refresh/reconcile, suspend/resume, Argo CD rollback, git compare links (UT). Manifest diff: missing (needs the Argo CD API). |
| Cloud, security scanning, cost, workspaces, YAML schema, support bundles | Missing.                                                                                                                                                                                                                                      |

#### Architecture Explorer benchmark

`pnpm bench`, Apple M4, 16 GB, Node 24, medians. Generated clusters: one
Deployment, ReplicaSet, five pods, Service, ConfigMap and Secret per
application.

| Size                   | Scenario                                    | Median, ms | Result                     |
| ---------------------- | ------------------------------------------- | ---------: | -------------------------- |
| medium, 10,100 objects | Build the graph                             |       26.5 | 10,100 nodes, 19,000 edges |
| medium                 | Cluster view, pods aggregated               |       33.4 | 1,500 of 6,050 shown       |
| medium                 | Lay out the cluster view                    |        1.5 |                            |
| medium                 | Dependency view of a Service and its layout |        1.9 | 8 nodes                    |
| large, 50,700 objects  | Build the graph                             |      140.3 | 50,700 nodes, 95,000 edges |
| large                  | Cluster view, pods aggregated               |      107.2 | 1,500 of 30,500 shown      |
| large                  | Lay out the cluster view                    |        1.8 |                            |
| large                  | Namespace view                              |       15.9 | 156 nodes                  |
| large                  | Dependency view of a Service and its layout |        6.4 | 8 nodes                    |

Rendering in React Flow is not part of the benchmark. The renderer bundle grew
from 22,464 kB to 23,010 kB with React Flow and the explorer.

### Accessibility

- White text on the accent colour (A11Y-1); focus outlines removed globally
  (A11Y-2); dialogs without dialog semantics or focus handling (A11Y-3); icon
  buttons without names (A11Y-4).
- No accessibility tests, no `prefers-reduced-motion` or `prefers-contrast`
  support; one dark high-contrast theme (FEAT-10).
- `lang="en"` is set; images have `alt`.

### Design and customisation

- Themes, accent, density and font size work, and persist. Chart colours and
  several components use fixed colours that ignore the theme (UI-4, UI-7); the
  editor uses stock Monaco themes (UI-5); compact density reaches only part of
  the layout (UI-6).
- Four documented styling systems (theme variables, global SCSS, CSS Modules,
  Tailwind) plus six undocumented `*.module.css` files; two `TabLayout`
  components; unused Material colour variables (CLEAN-1).
- Missing customisation: dashboard layout (FEAT-6), keyboard shortcuts
  (FEAT-5), table column order, a light high-contrast theme.

### Testing

- Unit tests are concentrated in `packages/core` (415 of 488 files). Packages
  without tests include `ensure-binaries` (binary verification) and
  `kubectl-versions`.
- Integration tests cover preferences, the command palette, extensions and
  the common cluster pages against KinD; pull requests run them on Linux arm64
  only, macOS and Windows on `main` and nightly.
- Untested: six resource views and several actions (QA-1); the AI approval
  flow end to end (QA-2); 32 skipped tests, some of them empty stubs (QA-3).
- Coverage is configured (`vitest.config.ts`, v8, lcov) but not collected in
  CI and has no threshold.

### Packaging and release

- `.github/workflows/prolens-release.yml` builds macOS (arm64, x64), Windows
  (x64, arm64) and Linux (x64, arm64) on native runners, checks each
  package's architecture and signature, and creates a draft release with
  checksums and provenance attestations. v1.0.0 was released this way.
- No signing credentials are configured (REL-1). No automatic updates, on
  purpose (FEAT-8).
- Windows and Linux packages were never installed; Codex, Gemini, Copilot and
  OpenCode were not run against a cluster.

### Dependencies

- Current majors throughout (Electron 44, React 19, MobX 7, TypeScript 7,
  Vite 8). `node-pty` is a beta. Overlaps: `joi` and `zod`, `tar` and
  `tar-stream`, `uuid` next to `crypto.randomUUID`, `@mui/material` next to
  the own components (CLEAN-2).
- Three patches in `patches/`: xterm (Node detection, typings), Monaco (use
  the patched DOMPurify), a test-only one.

## Gaps against comparable tools

The largest gaps with Lens and Headlamp are signed installers and automatic
updates (REL-1, FEAT-8), Gateway API views (FEAT-3), a resource map (FEAT-4),
RBAC-aware actions (FEAT-7) and, compared with Lens, an MCP server for
assistants (FEAT-1). ProLens's distinct strengths are the per-request approval
of an assistant's cluster changes (once SEC-1 and SEC-2 are fixed), the theme
engine with custom themes, and an MIT licence without an account.
