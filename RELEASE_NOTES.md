# ProLens v1.7.0

ProLens 1.7 explains warnings where you see them: click the warning icon of a
resource to read what is wrong, and ask your AI assistant why.

## Highlights

### Warning popover

- Clicking the warning icon in a resource table opens a popover with the
  object's warnings: its Warning events and the problems its status shows,
  such as CrashLoopBackOff, image pull errors, non-zero exits and failing
  conditions. Each shows its reason, message, how often it was seen and how
  long ago.
- The icon is in the Pods table as before, and now also in the Deployments,
  StatefulSets, DaemonSets, ReplicaSets, Jobs and CronJobs tables.
- The popover is never cut off by the table, moves above the icon near the
  bottom of the window, and closes with Escape, its close button or a click
  outside. It reads the events ProLens already loads, so it adds no requests
  to the cluster.

### Ask AI about a warning

- **Ask AI** in the popover opens the Ask AI dialog with the assistant you
  configured and the question "Explain this warning": what it means, the
  likely root cause, how to fix it, and the kubectl commands to confirm and
  to fix it.
- The warnings, the state, readiness and restart count of each container, the
  manifest, the events and the recent logs of the most affected pod are
  attached. You can untick any of them and preview the prompt before it is
  sent; credentials are redacted, and the assistant is told not to change the
  cluster without your approval.

### Container status

- The container squares in the Pods table are larger, and red now marks a
  crash-looping container, an image pull error or a non-zero exit. The
  tooltip shows each container's readiness and restart count.

## Downloads

| Platform             | Files                                                            |
| -------------------- | ---------------------------------------------------------------- |
| macOS, Apple silicon | `ProLens-1.7.0-macos-arm64.dmg`, `ProLens-1.7.0-macos-arm64.zip` |
| macOS, Intel         | `ProLens-1.7.0-macos-x64.dmg`, `ProLens-1.7.0-macos-x64.zip`     |
| Windows, x64         | `ProLens-1.7.0-windows-x64.exe` (installer)                      |
| Windows, ARM64       | `ProLens-1.7.0-windows-arm64.exe` (installer)                    |
| Linux, x86_64        | `ProLens-1.7.0-linux-x64.AppImage`, `.deb`, `.rpm`               |
| Linux, ARM64         | `ProLens-1.7.0-linux-arm64.AppImage`, `.deb`, `.rpm`             |

`ProLens-1.7.0-SHA256SUMS.txt` lists the SHA-256 of every file.

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
  `ProLens-1.7.0-SHA256SUMS.txt`.

## Requirements

- macOS 13 or later.
- Windows 10 or later.
- Linux with glibc 2.34 or later (Debian 12, Fedora 35, Ubuntu 22.04 or newer).
- Kubernetes 1.22 or later.

## Credits

ProLens is built on the work of the Freelens Authors and the OpenLens Authors,
and keeps their MIT license and copyright notices.
