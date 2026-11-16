# ProLens Roadmap

The prioritised backlog that follows from the audit of ProLens 1.0.0 (commit
`555c6b3b`, 2026-11-15). The current state of every feature is in
[FEATURE_MATRIX.md](FEATURE_MATRIX.md); how the code fits together is in
[ARCHITECTURE.md](ARCHITECTURE.md).

Paths are relative to the repository root; `core/` stands for
`packages/core/src/`.

## How items are ranked

- **Priority.** P0: a defect in the released version that affects safety or
  correctness; fix and release first. P1: the next minor release. P2: planned.
  P3: when convenient.
- **Effort.** S: up to a day. M: up to a week. L: more than a week.
- **Risk.** What can go wrong when doing it: low, medium, high.

Within a priority, items are ordered by value per effort, after their
dependencies.

## Overview

| ID      | Item                                                       | Priority | Effort | Risk   | Depends on   |
| ------- | ---------------------------------------------------------- | -------- | ------ | ------ | ------------ |
| SEC-1   | Fixed: AI gate let Secret reads through watch paths pass   | P0       | S      | low    |              |
| SEC-2   | AI sessions outlive the assistant                          | P0       | S      | low    |              |
| A11Y-1  | Text on the accent colour ignores `onAccent`               | P0       | S      | low    |              |
| SEC-3   | AI launch directory is not checked for ownership           | P1       | S      | low    |              |
| PERF-1  | Fixed: single-pod log tabs grew without limit              | P1       | S      | low    |              |
| BUG-2   | Deep links from the command line are lowercased            | P1       | S      | low    |              |
| SEC-7   | GitHub Actions pinned by tag                               | P1       | S      | low    |              |
| SEC-8   | No vulnerability scan of ProLens releases                  | P1       | M      | low    |              |
| SEC-4   | Electron fuses not set                                     | P1       | S      | medium |              |
| SEC-5   | Content-Security-Policy too permissive                     | P1       | M      | medium |              |
| SEC-9   | Extensions install without a checksum after a warning only | P1       | S      | low    |              |
| A11Y-2  | Focus outlines removed globally                            | P1       | S      | low    |              |
| A11Y-3  | Dialogs lack dialog semantics and focus handling           | P1       | M      | medium |              |
| A11Y-4  | Icon buttons without accessible names                      | P1       | M      | low    |              |
| UI-4    | Chart colours bypass the theme                             | P1       | S      | low    |              |
| UI-5    | Editor themes do not follow the ProLens palettes           | P1       | M      | low    |              |
| UI-7    | Fixed colours that break light or dark themes              | P1       | S      | low    |              |
| QA-1    | Views and actions with no test at all                      | P1       | M      | low    |              |
| QA-2    | No end-to-end test of the AI approval flow or themes       | P1       | M      | medium | SEC-1        |
| QA-3    | Skipped and empty tests                                    | P1       | S      | low    |              |
| REL-1   | Code signing and notarization                              | P1       | M      | low    | certificates |
| REL-2   | No upstream remote or sync routine                         | P1       | S      | medium |              |
| BUG-1   | Kubeconfig sync may miss changed contexts                  | P1       | S      | medium |              |
| SEC-6   | AppImage starts with `--no-sandbox`                        | P2       | M      | medium |              |
| UI-6    | Compact density reaches only part of the layout            | P2       | M      | medium |              |
| ARCH-1  | DI registration swallows every error                       | P2       | S      | medium |              |
| ARCH-2  | Two IPC systems                                            | P2       | L      | medium |              |
| ARCH-3  | Renderer without context isolation                         | P2       | L      | high   | Freelens     |
| FEAT-1  | Read-only MCP server for assistants                        | P2       | L      | medium | SEC-1        |
| FEAT-2  | API-based AI backends (Ollama, OpenAI-compatible)          | P2       | L      | medium |              |
| FEAT-3  | Gateway API views                                          | P2       | M      | low    |              |
| FEAT-4  | Resource map                                               | P2       | L      | medium |              |
| FEAT-5  | Configurable keyboard shortcuts                            | P2       | M      | low    |              |
| FEAT-6  | Configurable cluster overview                              | P2       | M      | low    | UI-4         |
| FEAT-7  | RBAC-aware actions                                         | P2       | M      | medium |              |
| FEAT-8  | Signed automatic updates                                   | P2       | L      | high   | REL-1        |
| FEAT-9  | Paginated lists for large clusters                         | P2       | L      | high   |              |
| FEAT-10 | Light high-contrast theme, reduced motion                  | P2       | S      | low    | A11Y-1       |
| CLEAN-1 | Dead and duplicate styling code                            | P3       | S      | low    |              |
| CLEAN-2 | Overlapping dependencies                                   | P3       | M      | low    |              |
| CLEAN-3 | `allowErrorReporting` preference without UI or use         | P3       | S      | low    |              |
| CLEAN-4 | Package metadata left from Freelens                        | P3       | S      | low    |              |
| FEAT-11 | Localisation                                               | P3       | L      | medium |              |

## P0: fix and release as 1.0.1

### SEC-1: Secret reads through watch paths pass the AI gate unapproved

**Fixed** in the working tree; release as 1.0.1 is still open.

`parseKubeApiPath` does not know the legacy watch form
`/api/v1/watch/[namespaces/<ns>/]<resource>[/<name>]` (and
`/apis/<group>/<version>/watch/...`). It reads `watch` as the resource, so
`GET /api/v1/watch/secrets` is classified as an ordinary read and an AI session
streams Secret values without approval. Reproduced against the shipped
classifier:

```text
/api/v1/secrets?watch=true          → approval (secret)
/api/v1/watch/secrets               → read
/api/v1/watch/namespaces/shop/secrets/db-password → read
```

- Files: `core/features/ai-tools/common/kube-request-policy.ts`,
  `kube-request-policy.test.ts`, `core/main/freelens-proxy/ai-session-gate.test.ts`.
- Acceptance criteria:
  - The parser skips a `watch` segment after the version for core and group
    APIs, namespaced and cluster-wide, with and without a name.
  - Every watch path to `secrets` requires approval with reason `secret`;
    watch paths to other resources stay reads.
  - Unit tests cover the paths above; the proxy test sends a watch request to
    Secrets with an AI token and gets a held request, then 403 when denied.
  - Released as 1.0.1, with the fix named in its notes.

### SEC-2: AI sessions outlive the assistant

An AI session token stays valid for 12 hours; nothing calls `revoke()` outside
tests. A token left in the terminal's environment or the temporary file keeps
working after the assistant exits.

- Files: `core/features/ai-tools/main/ai-sessions.injectable.ts`,
  `prepare-ai-launch.injectable.ts`, `renderer/launch-ai-tool.injectable.ts`,
  the terminal tab lifecycle in `core/renderer/components/dock/terminal/`
  and `core/main/shell-session/`.
- Acceptance criteria:
  - Closing the terminal tab, or the end of its shell session, revokes the
    session of the assistant started in it.
  - The token file is deleted once the launch command has read it.
  - The lifetime is shorter (for example 2 hours) and documented in
    `docs/prolens/ai-extensibility.md`.
  - A unit test shows a request with a revoked token gets 403.

### A11Y-1: Text on the accent colour ignores `onAccent`

Every palette defines `onAccent`, but `paletteToColors` never maps it. Primary
buttons (`packages/ui-components/button/src/button.scss`: `color: white`) and
the status bar (`core/renderer/components/status-bar/status-bar.module.scss`)
always draw white on the accent: about 1.4:1 on High Contrast (`#ffd400`), and
below 4.5:1 on Nord, Graphite and light accent presets such as `#f59e0b`.

- Files: `core/renderer/themes/lens-theme.ts` (new colour token, e.g.
  `textColorOnPrimary`), `core/renderer/themes/prolens/create-theme.ts`
  (`paletteToColors`, `withAccentColor` using `readableTextOn` for custom
  accents), `lens-dark.injectable.ts`, `lens-light.injectable.ts`, the two SCSS
  files above, `prolens/themes.test.ts`.
- Acceptance criteria:
  - Primary buttons, the status bar and the selected states that use the
    accent draw their text with the new token.
  - A test asserts a contrast of at least 4.5:1 between that token and the
    accent for every built-in theme and every accent preset.
  - A custom accent colour gets black or white text, whichever reads better.

## P1: next minor release

### SEC-3: AI launch directory is not checked for ownership

`prepare-ai-launch.injectable.ts` creates `os.tmpdir()/prolens-ai-<user>` with
mode 0700 but ignores a failed `chmod` and does not check the owner. On a
shared `/tmp`, another user can create the directory first.

- Acceptance criteria: the directory is verified with `lstat` to be a real
  directory owned by the current user with mode 0700, or the launch fails with
  a clear error; files are created with `O_EXCL`; a unit test covers a foreign
  directory and a symbolic link. On macOS and Windows, prefer the per-user
  temporary directory (`app.getPath("temp")`).

### PERF-1: Single-pod log tabs grow without limit

**Fixed:** single-pod tabs keep the newest 250,000 lines (`maxSinglePodLogLines`), with a unit test. The limit is a constant, not a preference.

`core/renderer/components/dock/logs/store.ts` caps only combined (tagged)
tabs: `limitLines` returns untagged logs unchanged, so a single pod that logs
for hours fills memory.

- Acceptance criteria: every log tab keeps at most a configurable number of
  lines (default as for combined tabs); the newest are kept; a unit test
  covers a single-pod tab over the limit.

### BUG-2: Deep links from the command line are lowercased

`core/main/electron-app/runnables/setup-deep-linking.injectable.ts`
lowercases every argument before finding the deep link, so case-sensitive
paths and query values (names, extension URLs) change on Windows and Linux.
Inherited from Freelens.

- Acceptance criteria: only the scheme is compared case-insensitively
  (`isDeepLinkUrl` already does); the URL is passed on unchanged; a test with
  a mixed-case path. Offer the fix to Freelens as well.

### SEC-7: GitHub Actions pinned by tag

Third-party actions, some given tokens, are referenced by tag.

- Files: `.github/workflows/*.yaml`, `.github/workflows/prolens-release.yml`,
  `.renovaterc.json`.
- Acceptance criteria: every third-party `uses:` names a commit SHA with the
  version as a comment; Renovate keeps them current
  (`helpers:pinGitHubActionDigests`).

### SEC-8: No vulnerability scan of ProLens releases

`release-scan.yaml` and the SBOM jobs run only in `freelensapp`. ProLens
releases carry no SBOM and are never scanned.

- Files: `.github/workflows/prolens-release.yml`, `.github/workflows/release-scan.yaml`.
- Acceptance criteria: each build job writes an SPDX SBOM that the draft
  release carries; a scheduled scan of the latest ProLens release reports
  findings (as a job summary or an issue).

### SEC-4: Electron fuses not set

`RunAsNode`, `NODE_OPTIONS` and the other fuses keep their defaults, so the
signed application binary can be started as a plain Node runtime.

- Files: `freelens/electron-builder.yml` (`electronFuses`).
- Acceptance criteria: `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and
  `EnableNodeCliInspectArguments` off, `EnableCookieEncryption` on;
  `npx @electron/fuses read --app <app>` shows them for each platform; the
  integration tests still pass (they rely on `--integration-testing`, not on
  inspect flags; check this first).

### SEC-5: Content-Security-Policy too permissive

`freelens/package.json` `config.contentSecurityPolicy` has no `default-src`,
`object-src`, `base-uri` or `form-action`, and allows `'unsafe-eval'`.

- Acceptance criteria: add `object-src 'none'; base-uri 'self'; form-action
  'none'`, and a `default-src` that the app and the fixture extension work
  with; find what needs `'unsafe-eval'` (Monaco, extensions) and remove it if
  possible, or record why not in `docs/extensions/api.md` (C10/C12).

### SEC-9: Extensions install without a checksum after a warning only

`core/features/extensions/installer/common/checksums.ts` only warns when no
integrity value is published, and the installed code runs with full
privileges.

- Acceptance criteria: an install without a verifiable checksum asks the user
  to confirm, naming the source; the installed extension's checksum is shown
  on the Extensions page.

### A11Y-2: Focus outlines removed globally

`core/renderer/components/app.scss` sets `outline: none` on every element;
only a handful of components restore a `:focus-visible` style.

- Acceptance criteria: a global `:focus-visible` outline in the accent colour
  (and the A11Y-1 contrast token where it sits on the accent); keyboard
  navigation through the sidebar, tables, menus, dialogs and the dock shows
  where focus is; components may refine but not remove it.

### A11Y-3: Dialogs lack dialog semantics and focus handling

`core/renderer/components/dialog/dialog.tsx` has no `role="dialog"`,
`aria-modal`, labelling, focus trap or focus restore; notifications
(`packages/ui-components/notifications`) have no live region.

- Acceptance criteria: dialogs announce themselves with their title, keep
  focus inside while open and return it on close; notifications are announced
  (`role="status"` / `alert`); a test asserts the attributes and the focus
  behaviour.

### A11Y-4: Icon buttons without accessible names

`packages/ui-components/icon/src/icon.tsx` renders interactive icons as `<i>`
without `role="button"`; screen readers read the ligature text
("arrow_back"). Examples without a tooltip or label: the back, forward and
home buttons in `core/renderer/components/layout/top-bar/`,
`hotbar/hotbar-selector.tsx`, `input/search-input.tsx`,
`item-object-list/page-filters/list.tsx`, the scale dialogs.

- Acceptance criteria: an interactive `Icon` has `role="button"` and an
  accessible name, taken from `tooltip` when given; a development warning or
  lint rule flags an interactive icon without one; the listed places are
  fixed. Add an axe check (`vitest-axe` or similar) for a few key screens.

### UI-4: Chart colours bypass the theme

Series colours are literals in `core/renderer/components/cluster/cluster-pie-charts.tsx`,
`cluster-metrics.tsx`, `nodes/node-charts.tsx`, `workloads-pods/pod-charts.tsx`,
`container-charts.tsx`, `network-ingresses/ingress-charts.tsx`; `#032b4d` is
nearly invisible on dark themes and `#fff73d` on light ones.

- Acceptance criteria: a chart palette in the theme tokens (derived from the
  ProLens palettes, with values for the classic themes); every chart takes its
  colours from it; screenshots of the overview in a dark and a light theme.

### UI-5: Editor themes do not follow the ProLens palettes

ProLens themes use the stock Monaco themes `vs`, `vs-dark` and `hc-black`, so
the editor ignores the palette's surfaces.

- Files: `core/renderer/components/monaco-editor/monaco-themes/`,
  `core/renderer/themes/prolens/create-theme.ts`.
- Acceptance criteria: each palette defines a Monaco theme from its `canvas`,
  text and accent tokens; custom themes get one too; the YAML editor, the
  resource editor and the Helm values editor use it.

### UI-7: Fixed colours that break light or dark themes

- Files: `core/renderer/components/delete-cluster-dialog/view.module.scss`
  (light-only), `app.scss` `code` (dark-only), `hotbar/hotbar-menu.scss`,
  `catalog/catalog-add-button.scss`, `dialog/dialog.scss`,
  `network-endpoint-slices/endpoint-slice-details.scss`; the window background
  `#1e2124` in `create-electron-window.injectable.ts`.
- Acceptance criteria: these use theme tokens; the window background follows
  the active theme (stored for the next start), so light themes do not flash
  dark.

### QA-1: Views and actions with no test at all

ReplicationControllers, VerticalPodAutoscalers, PriorityClasses, Leases,
EndpointSlices, IngressClasses; restart, CronJob trigger/suspend/resume, Helm
rollback/uninstall, force delete/finalize, port-forward dialog, service account
kubeconfig.

- Acceptance criteria: each view has a rendering test with a fixture object;
  the six views join the navigation scenarios of
  `freelens/integration/__tests__/cluster-pages.tests.ts` (creating the
  objects they need in the test namespace); each action has a unit test of the
  request it sends.

### QA-2: No end-to-end test of the AI approval flow or themes

The approval flow and theme persistence were tested by hand only.

- Acceptance criteria: an integration test starts a fake assistant (a script
  as the custom AI tool) that deletes a pod and reads a Secret, including
  through a watch path; denying keeps the pod and the Secret, allowing applies
  once. A second test selects a theme, accent and density, restarts and
  checks they are kept.

### QA-3: Skipped and empty tests

`core/features/cluster/refresh-accessibility-technical.test.ts` (empty
`describe.skip` blocks), `core/features/cluster/namespaces/edit-namespace-from-new-tab.test.tsx`,
`core/features/hotbar/hovering-hotbar-menu.test.ts`,
`packages/ui-components/tooltip/src/*.test.tsx`,
`core/features/helm-charts/add-custom-helm-repository-in-preferences.test.ts`,
and in integration `cluster-pages.tests.ts` (no-metrics link) and
`app-preferences.tests.ts` (Helm repositories).

- Acceptance criteria: each is fixed and enabled, or deleted with the reason
  in the pull request; no empty `describe.skip` remains.

### REL-1: Code signing and notarization

The pipeline supports signing, but no credentials are configured, so macOS
users must allow the app in Privacy & Security and Windows users pass
SmartScreen.

- Acceptance criteria: the secrets in `docs/prolens/releasing.md` are set; a
  release run shows "Signed with a Developer ID, notarized and stapled" and a
  signed Windows installer; `spctl` and `Get-AuthenticodeSignature` pass in CI.
  Requires an Apple Developer account and a Windows signing certificate or
  Azure Trusted Signing account.

### REL-2: No upstream remote or sync routine

The local clone has no `upstream` remote, and nothing tracks how far ProLens
is behind Freelens.

- Acceptance criteria: `docs/prolens/releasing.md` (or a new
  `docs/prolens/upstream.md`) describes adding
  `https://github.com/freelensapp/freelens` as `upstream` and merging its
  releases; the files ProLens changes on purpose (branding, themes, AI tools,
  workflows) are listed so conflicts are expected; a scheduled workflow opens
  an issue when Freelens publishes a release.

### BUG-1: Kubeconfig sync may miss changed contexts

`core/main/catalog-sources/kubeconfig-sync/compute-diff.injectable.ts` carries
a TODO saying a changed config is not detected as an update.

- Acceptance criteria: reproduce (edit the server or user of a synced
  context while ProLens runs); if reproduced, update the cluster and its
  connection and add a test; otherwise remove the TODO with the reason.

## P2: planned

### SEC-6: AppImage starts with `--no-sandbox`

`freelens/electron-builder.yml` passes `--no-sandbox` to the AppImage, which
turns off Chromium's sandbox for every user. Evaluate starting with the
sandbox and falling back only when unprivileged user namespaces are
unavailable, as the DEB post-install script does.

### UI-6: Compact density reaches only part of the layout

About two thirds of the spacing uses the build-time SCSS variables `$padding`,
`$margin` and `$unit` (`core/renderer/components/vars.scss`), which density
cannot change, and many font sizes are literal pixels. Move them to the CSS
variables, component by component, and let virtualised row heights follow
density. Acceptance: compact density visibly tightens tables, the sidebar,
drawers and dialogs; documented in `docs/prolens/themes.md`.

### ARCH-1: DI registration swallows every error

`scripts/generate-explicit-di-registration.mjs` wraps every `di.register` in a
`catch` that ignores all errors. Acceptance: only the duplicate-registration
error is ignored; anything else fails startup in development and the tests.

### ARCH-2: Two IPC systems

Move the legacy string channels in `core/common/ipc/` and their users to
`@freelensapp/messaging`, starting with cluster frame registration.
Coordinate with Freelens, which owns most of this code.

### ARCH-3: Renderer without context isolation

All windows run with `nodeIntegration: true` and `contextIsolation: false`, so
a renderer flaw or any extension has the user's full privileges. Moving to
context isolation and a preload bridge breaks the extension API (C3, C4), so
it can only be done together with Freelens or with a ProLens extension API
version of its own. Start by inventorying the renderer's Node use
(`scripts/type-check-environments/legacy.jsonc` lists it) and shrinking it.

### FEAT-1: Read-only MCP server for assistants

Expose cluster reads (resources, events, logs, metrics) to assistants as an MCP
server inside ProLens, read-only by default, with writes prepared in ProLens
editors for the user to apply, and a switch to turn it off. Lens charges for
an equivalent. Builds on `docs/prolens/ai-extensibility.md` and the
`McpServerConfiguration` declared in `core/features/ai-tools/common/ai-tools.ts`.

### FEAT-2: API-based AI backends

Implement `aiBackendInjectionToken` for Ollama and OpenAI-compatible
endpoints, with credentials in the OS keychain (`safeStorage`) and requests
only from main, so ProLens works with local models without a CLI tool.

### FEAT-3: Gateway API views

List and detail views for GatewayClass, Gateway, HTTPRoute, GRPCRoute and
ReferenceGrant (`packages/kube-object/src/specifics/`, routes under
`core/common/front-end-routing/routes/cluster/network/`), shown when the
cluster serves `gateway.networking.k8s.io`.

### FEAT-4: Resource map

A graph of how a workload's objects relate (Ingress/Gateway → Service →
EndpointSlice → Pod ← ReplicaSet ← Deployment, with ConfigMaps, Secrets and
PVCs), as Headlamp offers, extensible by extensions.

### FEAT-5: Configurable keyboard shortcuts

The shortcut framework (`packages/business-features/keyboard-shortcuts`) has
no registered shortcuts. Register the existing ones through it, list them in
Preferences, and allow rebinding.

### FEAT-6: Configurable cluster overview

Let the user choose, order and hide the blocks of the cluster overview
(`clusterOverviewUIBlockInjectionToken`), per cluster or globally.

### FEAT-7: RBAC-aware actions

Disable or hide actions (edit, delete, scale, exec) the user's RBAC does not
allow, using SelfSubjectAccessReview, as views are already hidden today.

### FEAT-8: Signed automatic updates

Once REL-1 is done, add electron-updater with the ProLens releases only,
signature checks on every platform and an opt-out; until then the update
notification stays.

### FEAT-9: Paginated lists for large clusters

`KubeObjectStore` loads every object of a kind in one request. Use
`limit`/`continue` and incremental rendering for very large clusters.

### FEAT-10: Light high-contrast theme, reduced motion

Add a light high-contrast palette, follow `prefers-contrast` for the System
theme, and honour `prefers-reduced-motion` in transitions and animations.

## P3: when convenient

- **CLEAN-1.** Remove the unused Material colour variables in
  `core/renderer/components/colors.scss`; merge the two `TabLayout`
  components (`layout/tab-layout.tsx`, `tab-layout-2.tsx`); move the six
  `*.module.css` files to `*.module.scss` or document them in
  `docs/styling.md`.
- **CLEAN-2.** Use one validation library (zod; `joi` remains),
  `crypto.randomUUID` instead of `uuid`, and check whether `@mui/material` is
  still needed next to the own components.
- **CLEAN-3.** Remove `allowErrorReporting` from
  `core/features/user-preferences/common/preference-descriptors.injectable.ts`
  and `storage.injectable.ts` (keeping stored values readable), or implement
  opt-in error reporting with a UI.
- **CLEAN-4.** Correct the description of `packages/kube-object/package.json`
  ("Injection tokens for list layout"); review user-visible leftovers of
  Freelens names that are not compatibility-bound.
- **FEAT-11.** Localisation: introduce a message catalogue for the UI strings,
  starting with the welcome page, preferences and dialogs.
