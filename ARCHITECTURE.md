# ProLens Architecture

ProLens is an Electron desktop application for Kubernetes, forked from
[Freelens](https://github.com/freelensapp/freelens), which is itself a fork of
OpenLens. This document describes how the code is organised and how the parts
talk to each other. Conventions for changing the code are in
[AGENTS.md](AGENTS.md); the extension contracts are in
[docs/extensions/api.md](docs/extensions/api.md).

## Repository layout

A pnpm workspace (`pnpm-workspace.yaml`) built by Turbo (`turbo.json`).
Versions of shared dependencies are pinned once, in the `catalog` of
`pnpm-workspace.yaml`.

| Path                                                                               | Role                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `freelens/`                                                                        | The Electron application: entry points (`src/main/index.ts`, `src/renderer/index.ts`), electron-vite config, electron-builder config, bundled binaries, integration tests. The package keeps the name `freelens`; its product name is ProLens. |
| `packages/core`                                                                    | Almost all application code: main process, renderer, shared code, the extension host and every feature.                                                                                                                                        |
| `packages/extensions`                                                              | The published `@freelensapp/extensions` package: a runtime shim over `globalThis.FreelensExtensionApi` and the rolled-up type declarations.                                                                                                    |
| `packages/kube-object`                                                             | `KubeObject` and the typed Kubernetes object classes.                                                                                                                                                                                          |
| `packages/utility-features/kube-api*`                                              | `KubeApi` (list, get, watch, patch) and one API class per resource kind, with their injectables.                                                                                                                                               |
| `packages/technical-features/*`                                                    | Framework pieces: `feature-core` (feature registration), `application` (startup phases), `messaging` (IPC), `prometheus` (metrics providers), `react-application`.                                                                             |
| `packages/ui-components/*`                                                         | Shared, extension-visible components: button, icon, tooltip, notifications, spinner, animate, error boundary, resizing anchor.                                                                                                                 |
| `packages/cluster-sidebar`, `list-layout`, `cluster-settings`, `metrics`           | Injection tokens that extensions use to add sidebar items, list columns, settings and metrics.                                                                                                                                                 |
| `packages/ensure-binaries`, `kubectl-versions`                                     | Download and verify the bundled `kubectl`, `helm` and `freelens-k8s-proxy`, and the checksums of kubectl versions downloaded at runtime.                                                                                                       |
| `packages/generate-license`, `generate-tray-icons`, `semver`, `resource-templates` | Build-time tools and data.                                                                                                                                                                                                                     |
| `scripts/`                                                                         | DI registration generator, type-check of runtime environments, Vite plugins.                                                                                                                                                                   |

Dependencies point inwards: `freelens` depends on `core` and the technical
features; `core` depends on nearly every package; leaf packages depend only on
`utilities` and `@ogre-tools`.

## Build

1. `pnpm build:di` generates the `register-injectables.ts` files (see
   "Dependency injection").
2. `pnpm build` runs Turbo: every package, then the application.
   `freelens/electron.vite.config.ts` bundles the workspace packages from their
   TypeScript sources:
   - main is an ES module (`static/build/main.js`), with dependencies left
     external except `@ogre-tools/*`;
   - the renderer is a Vite bundle with Tailwind (PostCSS) and Monaco workers.
     Imports of `electron` and Node built-ins become runtime `require` calls,
     because the renderer has Node integration.
3. `pnpm build:resources` generates the licence file and tray icons, and
   downloads the bundled binaries, verifying each against
   `freelens/binaries.lock.json`.
4. `pnpm build:app` packages the application with electron-builder
   (`freelens/electron-builder.yml`). Each platform must be packaged on its own
   OS and architecture, because node-pty and the bundled binaries are native.

Releases are built by `.github/workflows/prolens-release.yml`; see
[docs/prolens/releasing.md](docs/prolens/releasing.md).

## Processes and frames

```text
┌──────────────────────── main process (Node, Electron) ────────────────────────┐
│ DI container "main" · cluster manager · catalog · user stores · kubeconfig sync │
│ FreelensProxy (HTTPS, 127.0.0.1:random) ── /api-kube ─► freelens-k8s-proxy ─► cluster
│                                          ── /api      ─► local router (helm, port-forward, metrics, apply)
│                                          ── /         ─► renderer bundle
│ shell sessions (node-pty) · AI sessions and approvals · extension host (main)  │
└──────────────▲───────────────────────────────▲─────────────────────────────────┘
               │ IPC                            │ IPC (sendToFrame)
┌──────────────┴──────────────┐   ┌─────────────┴──────────────────────────────┐
│ root frame                  │   │ cluster frame (one iframe per open cluster) │
│ https://renderer.freelens.app│  │ https://<clusterId>.renderer.freelens.app   │
│ catalog, welcome, prefs,    │   │ resource views, dock (terminal, logs,       │
│ hotbar, top bar, dialogs    │   │ editors), Ask AI dialog                     │
└─────────────────────────────┘   └────────────────────────────────────────────┘
```

- **Main process.** `freelens/src/main/index.ts` creates the DI container,
  registers `core` and the technical features, and calls
  `startApplicationInjectionToken`. Startup runs in phases, each a token that
  features register "runnables" under: `beforeElectronIsReady`,
  `beforeApplicationIsLoading`, `onLoadOfApplication`,
  `afterApplicationIsLoaded`, then `afterWindowIsOpened`, `afterRootFrameIsReady`
  and the quit phases (`packages/core/src/main/start-main-application/`).
- **Renderer.** `freelens/src/renderer/index.ts` does the same for the renderer.
  `packages/core/src/renderer/bootstrap.tsx` starts either the root frame or a
  cluster frame (`process.isMainFrame`).
- **Cluster frames.** Each opened cluster is an iframe on its own origin,
  `<clusterId>.renderer.freelens.app`, created by
  `renderer/components/cluster-manager/cluster-frame-handler.ts`. The host name
  resolves to 127.0.0.1 through a Chromium host-resolver rule set at startup,
  and is served by FreelensProxy with a certificate generated in memory at
  every start, which the window session trusts byte for byte.
- **Windows.** One factory,
  `main/start-main-application/lens-window/application-window/create-electron-window.injectable.ts`,
  with `nodeIntegration: true`, `nodeIntegrationInSubFrames: true`,
  `contextIsolation: false` and no preload script. New windows are refused;
  external links open in the browser (http and https only).

## Inter-process communication

Two systems coexist.

- **`@freelensapp/messaging`** (`packages/technical-features/messaging`), used
  by new code. A channel is declared once in common code:
  - a request channel (`RequestChannel<Request, Response>`) is answered by main
    (`ipcMain.handle` / `ipcRenderer.invoke`);
  - a message channel (`MessageChannel<T>`) is one-way, in either direction.
    Main delivers to every window and every registered frame (`sendToFrame`).

  Listeners are injectables (`getRequestChannelListenerInjectable`,
  `getMessageChannelListenerInjectable`) and are enlisted at startup. The
  renderer cannot answer requests.
- **Legacy string channels** in `packages/core/src/common/ipc/` (`ipcMainHandle`,
  `ipcMainOn`, `ipcRendererOn`, `broadcastMainChannel`), still used for cluster
  frame registration, catalog sync, window and extension handling.

A cluster frame registers itself with main on start
(`cluster:set-frame-id`); main keeps `{ processId, frameId }` per cluster
(`common/cluster-frames.injectable.ts`) to send messages to that frame and to
navigate it.

Persistent stores are synchronised the same way: main owns the files and
broadcasts changes; renderers send theirs to main.

## Dependency injection

Everything is an injectable of `@ogre-tools/injectable`
(`getInjectable`, `getInjectionToken`, `di.inject`, `di.injectMany`). Features
extend each other through injection tokens: sidebar items, routes, preference
blocks, top-bar items, frame child components, themes, AI tool providers and
the startup phases are all tokens.

`scripts/generate-explicit-di-registration.mjs` (`pnpm build:di`) writes a
`register-injectables.ts` for every directory with injectables, plus the roots
`packages/core/src/register-injectables-main.ts` and
`register-injectables-renderer.ts`. Paths under `main/` or `renderer/` are
registered only in that process. Each registration is wrapped in a `try`
whose `catch` ignores every error, not only duplicate registrations (see
ROADMAP, ARCH-1). CI checks that the files are current
(`.github/workflows/di-registration.yaml`).

## Kubernetes access

1. **Discovery.** Kubeconfig files and folders listed in Preferences are
   watched (`main/catalog-sources/kubeconfig-sync/`); each context becomes a
   catalog entity and a `Cluster` (`common/cluster/cluster.ts`), stored in
   `lens-cluster-store`.
2. **Connection.** Opening a cluster starts one `freelens-k8s-proxy` (a Go
   binary) for it, with the user's kubeconfig, a random API prefix and its own
   TLS certificate (`main/freelens-k8s-proxy/`,
   `main/cluster/freelens-k8s-proxy-manager.injectable.ts`).
3. **FreelensProxy** (`main/freelens-proxy/freelens-proxy.ts`) is the only
   endpoint the renderer and the integrated terminal talk to:
   - it accepts only its own host names and origins (`allowed-request.ts`),
     and requires a per-run token on everything under `/api`: a session cookie
     for the windows, `Authorization: Bearer` for kubectl and helm, which get it
     from `FREELENS_PROXY_TOKEN` through the exec plugin of a generated
     kubeconfig;
   - it strips the token before forwarding to the cluster's k8s-proxy;
   - for AI sessions it consults the **AI session gate** (below).
4. **Objects.** `KubeApi` lists, watches and patches resources; a
   `KubeObjectStore` per kind keeps the objects of the selected namespaces and
   applies watch events in batches (`common/k8s-api/kube-object.store.ts`).
   Views subscribe to the stores they show and unsubscribe when they close.
5. **Binaries.** The bundled kubectl, helm and k8s-proxy are verified at build
   time against `freelens/binaries.lock.json`. A kubectl matching the cluster's
   version is downloaded at runtime only if its digest is pinned in
   `packages/kubectl-versions`.
6. **Metrics.** Prometheus is queried through the cluster's proxy by provider
   (`packages/technical-features/prometheus`: lens, helm, operator, stacklight,
   openshift), or auto-detected; set per cluster in its settings.

## State

MobX 7 everywhere. State lives in injectables. Persistent state uses
`features/persistent-storage` (JSON files through `conf` in the user-data
directory, written by main only):

| Store                | File name                  |
| -------------------- | -------------------------- |
| Clusters             | `lens-cluster-store`       |
| User preferences     | `lens-user-store`          |
| Hotbars              | `lens-hotbar-store`        |
| Favorites            | `freelens-favorites-store` |
| Web links            | `lens-weblink-store`       |
| Enabled extensions   | `lens-extensions`          |
| Installed extensions | `installed-extensions`     |

The user-data directory is `ProLens` (`ProLensDev` in development), separate
from Freelens. Preferences are declared in
`features/user-preferences/common/preference-descriptors.injectable.ts`.

## Extensions

Extensions are ES modules with a main and/or renderer entry. The host publishes
the API on `globalThis.FreelensExtensionApi` (`Common`, `Main`, `Renderer`) with
shared singletons (React, MobX, Monaco), and loads renderer entries from the
privileged `freelens-extension:` scheme. Installation (registry, URL, file,
folder or deep link with confirmation) verifies a checksum when one is
published. Extensions run with the full privileges of the application; the
contracts C1–C15 are in [docs/extensions/api.md](docs/extensions/api.md).

The extension API version follows Freelens (2.x), independently of the
application version, so Freelens v2 extensions load in ProLens.

## ProLens additions

- **Branding** (`packages/core/src/common/branding.ts`): product name, app id
  `app.prolens.ProLens`, the `prolens://` scheme (legacy `freelens://` links
  accepted), release repository. Internal host names, the k8s-proxy binary and
  the `@freelensapp/*` package scope keep their Freelens names for
  compatibility.
- **Themes** (`renderer/themes/prolens/`): a `ThemePalette` of semantic tokens
  that `createTheme` expands into every Lens colour token; seven palettes;
  custom JSON themes; accent colour, density and font size
  (`features/theme/customization/`). See
  [docs/prolens/themes.md](docs/prolens/themes.md).
- **AI tools** (`features/ai-tools/`):
  - providers (Claude Code, Codex CLI, Copilot CLI, Gemini CLI, OpenCode,
    custom) registered under `aiToolProviderInjectionToken`, detected in main;
  - Ask AI builds a prompt from context sources (manifest, events, logs, with
    Secret values redacted) and starts the tool in the cluster's terminal;
  - each launch gets its own session token. The **AI session gate** in
    FreelensProxy lets reads through and holds writes, interactive requests and
    Secret reads until the user approves that request in the root frame
    (`common/kube-request-policy.ts`, `main/ai-session-gate.injectable.ts`,
    `renderer/ai-approval-dialog.tsx`).

  The gate is a guardrail: the assistant runs as the user and can read the
  user's own credentials. See
  [docs/prolens/ai-extensibility.md](docs/prolens/ai-extensibility.md).

## Known architectural debt

- The renderer has Node integration without context isolation, so renderer
  code and every extension run with the user's full privileges.
- Two IPC systems; root and cluster frames share code without a boundary
  (`renderer/bootstrap.tsx` notes it).
- The DI generator swallows registration errors.
- Files that need DOM in main or Node in the renderer are tracked on
  `scripts/type-check-environments/legacy.jsonc`, which may only shrink.

The prioritised backlog is in [ROADMAP.md](ROADMAP.md).
