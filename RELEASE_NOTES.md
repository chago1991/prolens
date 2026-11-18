# ProLens v1.4.0

ProLens 1.4 adds Kubernetes Gateway API support: every Gateway API resource
the cluster serves, visual editors for listeners and HTTP routing, and a
topology of the traffic path from the gateway class to the pods.

## Highlights

### Gateway API

- **Network → Gateway API** in the cluster sidebar holds an **Overview**, a
  **Topology** and a page for each resource: **Gateway Classes**,
  **Gateways**, **HTTP Routes**, **GRPC Routes**, **TCP Routes**,
  **TLS Routes**, **UDP Routes**, **Reference Grants**,
  **Backend TLS Policies** and **Listener Sets**.
- A page is shown only when the cluster serves the resource and you may list
  it. Versions come from API discovery, standard and experimental channels
  alike. Without the CRDs, the overview explains how to install them.
- Details show listeners and their status, attached routes, parents and the
  listeners a route attaches to, matches, filters, weighted backends and
  timeouts, and flag missing backends, rejected routes and cross-namespace
  references without a ReferenceGrant.
- Listeners of gateways and listener sets, and the hostnames and rules of HTTP
  routes, can be edited visually. Changes are validated and checked against
  RBAC before they are applied, and resources that look like production ask
  for their name to be typed.
- The **Topology** draws GatewayClass → Gateway → Listener → Route → Service
  → EndpointSlice → Pod, with backend weights and problems highlighted, and
  follows changes in the cluster.

### Cilium

- When Cilium is the Gateway API controller, a gateway shows its load
  balancer Service, CiliumEnvoyConfig, and the Hubble Relay and Hubble UI of
  the cluster.

## Downloads

| Platform             | Files                                                            |
| -------------------- | ---------------------------------------------------------------- |
| macOS, Apple silicon | `ProLens-1.4.0-macos-arm64.dmg`, `ProLens-1.4.0-macos-arm64.zip` |
| macOS, Intel         | `ProLens-1.4.0-macos-x64.dmg`, `ProLens-1.4.0-macos-x64.zip`     |
| Windows, x64         | `ProLens-1.4.0-windows-x64.exe` (installer)                      |
| Windows, ARM64       | `ProLens-1.4.0-windows-arm64.exe` (installer)                    |
| Linux, x86_64        | `ProLens-1.4.0-linux-x64.AppImage`, `.deb`, `.rpm`               |
| Linux, ARM64         | `ProLens-1.4.0-linux-arm64.AppImage`, `.deb`, `.rpm`             |

`ProLens-1.4.0-SHA256SUMS.txt` lists the SHA-256 of every file.

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
  `ProLens-1.4.0-SHA256SUMS.txt`.

## Requirements

- macOS 13 or later.
- Windows 10 or later.
- Linux with glibc 2.34 or later (Debian 12, Fedora 35, Ubuntu 22.04 or newer).
- Kubernetes 1.22 or later.

## Credits

ProLens is built on the work of the Freelens Authors and the OpenLens Authors,
and keeps their MIT license and copyright notices.
