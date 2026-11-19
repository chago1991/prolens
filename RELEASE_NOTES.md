# ProLens v1.5.0

ProLens 1.5 keeps several clusters at hand in tabs, lets you arrange the
columns of every resource list, and adds a create button to all of them.

## Highlights

### Cluster tabs

- Every cluster you open gets a tab at the top of the window, labelled with
  the page open in it, such as **Pods - my-cluster**, with a dot that shows
  whether it is connected. The **Welcome** tab leads back to the catalog.
- Click a tab to switch clusters. Closing a tab, with **×** or a middle click,
  hides the cluster without disconnecting it.

### Resource lists

- Drag a column header onto another to move the column. The order is kept for
  each table; **Reset column order** in the column menu restores the default.
- The round **+** button in the corner of every resource list opens the
  **Create resource** editor with a manifest for that kind, in the selected
  namespace.
- Rows have a faint separator, links are underlined, and the container status
  of a restarted container is no longer outlined in orange.

## Downloads

| Platform             | Files                                                            |
| -------------------- | ---------------------------------------------------------------- |
| macOS, Apple silicon | `ProLens-1.5.0-macos-arm64.dmg`, `ProLens-1.5.0-macos-arm64.zip` |
| macOS, Intel         | `ProLens-1.5.0-macos-x64.dmg`, `ProLens-1.5.0-macos-x64.zip`     |
| Windows, x64         | `ProLens-1.5.0-windows-x64.exe` (installer)                      |
| Windows, ARM64       | `ProLens-1.5.0-windows-arm64.exe` (installer)                    |
| Linux, x86_64        | `ProLens-1.5.0-linux-x64.AppImage`, `.deb`, `.rpm`               |
| Linux, ARM64         | `ProLens-1.5.0-linux-arm64.AppImage`, `.deb`, `.rpm`             |

`ProLens-1.5.0-SHA256SUMS.txt` lists the SHA-256 of every file.

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
  `ProLens-1.5.0-SHA256SUMS.txt`.

## Requirements

- macOS 13 or later.
- Windows 10 or later.
- Linux with glibc 2.34 or later (Debian 12, Fedora 35, Ubuntu 22.04 or newer).
- Kubernetes 1.22 or later.

## Credits

ProLens is built on the work of the Freelens Authors and the OpenLens Authors,
and keeps their MIT license and copyright notices.
