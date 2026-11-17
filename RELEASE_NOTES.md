# ProLens v1.3.0

ProLens 1.3 turns GitOps into a full section of the sidebar, in the layout of
Argo CD, and makes the current page and the list filters easier to find.

## Highlights

### GitOps

- **GitOps** in the cluster sidebar now expands into **Dashboard**,
  **Applications**, **Application Sets**, **Projects** and **Settings**, with
  **Repositories** and **Clusters** under it. Pages that apply to Argo CD
  only are shown when Argo CD is installed.
- The dashboard counts apps by sync and health state, and lists the apps that
  need attention and the latest syncs.
- Application sets and projects list the apps they hold; repositories and
  clusters list the apps that use them. Repositories include Flux sources and
  repositories apps name without a secret.
- Argo CD repository and cluster secrets are read for their URL, type,
  project and server only; credentials are never decoded. Without permission
  to list secrets, the pages show what the apps reference.
- Every page filters by namespace and searches from the left of its toolbar.

### Navigation

- Resource lists such as Pods show the namespace selector and the search next
  to their title.
- Opening a page expands its group in the sidebar, scrolls to it, and
  outlines it, so the current page is always visible.

## Downloads

| Platform             | Files                                                            |
| -------------------- | ---------------------------------------------------------------- |
| macOS, Apple silicon | `ProLens-1.3.0-macos-arm64.dmg`, `ProLens-1.3.0-macos-arm64.zip` |
| macOS, Intel         | `ProLens-1.3.0-macos-x64.dmg`, `ProLens-1.3.0-macos-x64.zip`     |
| Windows, x64         | `ProLens-1.3.0-windows-x64.exe` (installer)                      |
| Windows, ARM64       | `ProLens-1.3.0-windows-arm64.exe` (installer)                    |
| Linux, x86_64        | `ProLens-1.3.0-linux-x64.AppImage`, `.deb`, `.rpm`               |
| Linux, ARM64         | `ProLens-1.3.0-linux-arm64.AppImage`, `.deb`, `.rpm`             |

`ProLens-1.3.0-SHA256SUMS.txt` lists the SHA-256 of every file.

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
  `ProLens-1.3.0-SHA256SUMS.txt`.

## Requirements

- macOS 13 or later.
- Windows 10 or later.
- Linux with glibc 2.34 or later (Debian 12, Fedora 35, Ubuntu 22.04 or newer).
- Kubernetes 1.22 or later.

## Credits

ProLens is built on the work of the Freelens Authors and the OpenLens Authors,
and keeps their MIT license and copyright notices.
