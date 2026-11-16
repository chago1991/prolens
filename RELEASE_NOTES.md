# ProLens v1.1.0

ProLens 1.1 adds the Architecture Explorer, makes large clusters much faster,
and fixes a gap in the approval of AI requests.

## Highlights

### Architecture Explorer

- **Architecture** in the cluster sidebar draws how the cluster's resources
  are connected: workloads, pods, nodes, Services and EndpointSlices,
  Ingresses and Gateway API routes, ConfigMaps, Secrets, ServiceAccounts,
  claims, volumes, storage classes and network policies (Cilium included).
- **Explore dependencies**, in the menu of every resource, shows what the
  resource needs and what it affects, and names the likely root cause of a
  problem with its evidence, such as a crash-looping pod, a missing
  ConfigMap, a pending claim or a Service whose selector matches nothing.
- Every link says how it is known: observed (recorded by the cluster),
  referenced (named in a spec) or inferred (from selectors or defaults), with
  the evidence to check it against the YAML. Missing objects are shown as
  such.
- Views for the cluster, a namespace, the network, routing, storage and
  scheduling; search, filters, grouping, collapsible groups, draggable nodes,
  and export as SVG or PNG. It reads only the data the cluster view already
  loads, never Secret values.

### Faster on large clusters

- Workload statuses and the workloads overview no longer scan every pod for
  every workload. On a generated cluster of about 40,000 pods, an update of
  the overview went from minutes to about a tenth of a second.
- Interrupted watches are retried with backoff, and the list says when its
  data may be out of date.
- Single-pod log tabs keep the newest 250,000 lines instead of growing
  without limit.
- A damaged settings file no longer stops ProLens from starting: it is moved
  aside and its defaults are used.

### Security

- Secret reads by an AI assistant through the legacy watch paths
  (`/api/v1/watch/...`) now wait for approval, like every other Secret read.

## Downloads

| Platform             | Files                                                            |
| -------------------- | ---------------------------------------------------------------- |
| macOS, Apple silicon | `ProLens-1.1.0-macos-arm64.dmg`, `ProLens-1.1.0-macos-arm64.zip` |
| macOS, Intel         | `ProLens-1.1.0-macos-x64.dmg`, `ProLens-1.1.0-macos-x64.zip`     |
| Windows, x64         | `ProLens-1.1.0-windows-x64.exe` (installer)                      |
| Windows, ARM64       | `ProLens-1.1.0-windows-arm64.exe` (installer)                    |
| Linux, x86_64        | `ProLens-1.1.0-linux-x64.AppImage`, `.deb`, `.rpm`               |
| Linux, ARM64         | `ProLens-1.1.0-linux-arm64.AppImage`, `.deb`, `.rpm`             |

`ProLens-1.1.0-SHA256SUMS.txt` lists the SHA-256 of every file.

## Installing

ProLens does not update itself. It tells you when a newer release is
available; download and install it from the releases page.

When a file is not code-signed (see "Signing" below), the operating system
warns before the first start:

- **macOS:** open the app once, then choose **Open Anyway** in System Settings
  → Privacy & Security.
- **Windows:** in the SmartScreen dialog, choose **More info**, then
  **Run anyway**.
- **Linux:** packages are not signed; compare their checksums with
  `ProLens-1.1.0-SHA256SUMS.txt`.

## Requirements

- macOS 13 or later.
- Windows 10 or later.
- Linux with glibc 2.34 or later (Debian 12, Fedora 35, Ubuntu 22.04 or newer).
- Kubernetes 1.22 or later.

## Credits

ProLens is built on the work of the Freelens Authors and the OpenLens Authors,
and keeps their MIT license and copyright notices.
