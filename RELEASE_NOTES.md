# ProLens v1.6.0

ProLens 1.6 brings eBPF tracing to nodes and pods: pick a trace from the
context menu and watch its output stream into a terminal tab.

## Highlights

### BPF Trace

- The context menu of a Linux node, and of a pod with a running container, has
  a **BPF Trace** sub-menu. Each entry runs
  [bpftrace](https://github.com/bpftrace/bpftrace) on the node through the
  [kubectl-trace](https://github.com/iovisor/kubectl-trace) plugin and streams
  the output into a new terminal tab; Ctrl-C stops it and prints the summary.
- Node traces: new processes, opened files, outbound TCP connections, system
  calls per process and a histogram of disk I/O sizes.
- Pod traces follow the main process of the default container: the processes
  it starts, the files it opens, its TCP connections and its system calls.
- **Custom program…** puts the command on the prompt for you to write your own
  program; **List trace runs** shows the trace jobs in the cluster.
- Needs the plugin (`kubectl krew install trace`) and a namespace in the
  kubeconfig context that admits privileged pods. See
  `docs/prolens/bpf-trace.md`.

## Downloads

| Platform             | Files                                                            |
| -------------------- | ---------------------------------------------------------------- |
| macOS, Apple silicon | `ProLens-1.6.0-macos-arm64.dmg`, `ProLens-1.6.0-macos-arm64.zip` |
| macOS, Intel         | `ProLens-1.6.0-macos-x64.dmg`, `ProLens-1.6.0-macos-x64.zip`     |
| Windows, x64         | `ProLens-1.6.0-windows-x64.exe` (installer)                      |
| Windows, ARM64       | `ProLens-1.6.0-windows-arm64.exe` (installer)                    |
| Linux, x86_64        | `ProLens-1.6.0-linux-x64.AppImage`, `.deb`, `.rpm`               |
| Linux, ARM64         | `ProLens-1.6.0-linux-arm64.AppImage`, `.deb`, `.rpm`             |

`ProLens-1.6.0-SHA256SUMS.txt` lists the SHA-256 of every file.

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
  `ProLens-1.6.0-SHA256SUMS.txt`.

## Requirements

- macOS 13 or later.
- Windows 10 or later.
- Linux with glibc 2.34 or later (Debian 12, Fedora 35, Ubuntu 22.04 or newer).
- Kubernetes 1.22 or later.

## Credits

ProLens is built on the work of the Freelens Authors and the OpenLens Authors,
and keeps their MIT license and copyright notices.
