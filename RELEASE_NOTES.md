# ProLens v1.2.0

ProLens 1.2 adds a GitOps view for Argo CD and Flux, and shortens the life of
AI assistant sessions.

## Highlights

### GitOps

- **GitOps** appears in the cluster sidebar when Argo CD or Flux is
  installed. It lists Argo CD Applications and Flux Kustomizations and
  HelmReleases with their sync state and health, and filters those that need
  attention.
- An app shows its managed resources (linked to their details), the ones
  that drifted from git or are unhealthy, its history and its source.
- Sync, refresh, reconcile, suspend and resume, and Argo CD rollback to an
  earlier revision, each after confirmation. ProLens changes only the app's
  own resource, as `argocd` and `flux` do; the controllers do the rest.
- Revisions on GitHub, GitLab and Bitbucket link to a comparison in git.

### AI assistants

- The session of an assistant ends when its terminal tab is closed, and after
  two hours at the latest. The token file is deleted as soon as it is read.

## Downloads

| Platform             | Files                                                            |
| -------------------- | ---------------------------------------------------------------- |
| macOS, Apple silicon | `ProLens-1.2.0-macos-arm64.dmg`, `ProLens-1.2.0-macos-arm64.zip` |
| macOS, Intel         | `ProLens-1.2.0-macos-x64.dmg`, `ProLens-1.2.0-macos-x64.zip`     |
| Windows, x64         | `ProLens-1.2.0-windows-x64.exe` (installer)                      |
| Windows, ARM64       | `ProLens-1.2.0-windows-arm64.exe` (installer)                    |
| Linux, x86_64        | `ProLens-1.2.0-linux-x64.AppImage`, `.deb`, `.rpm`               |
| Linux, ARM64         | `ProLens-1.2.0-linux-arm64.AppImage`, `.deb`, `.rpm`             |

`ProLens-1.2.0-SHA256SUMS.txt` lists the SHA-256 of every file.

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
  `ProLens-1.2.0-SHA256SUMS.txt`.

## Requirements

- macOS 13 or later.
- Windows 10 or later.
- Linux with glibc 2.34 or later (Debian 12, Fedora 35, Ubuntu 22.04 or newer).
- Kubernetes 1.22 or later.

## Credits

ProLens is built on the work of the Freelens Authors and the OpenLens Authors,
and keeps their MIT license and copyright notices.
