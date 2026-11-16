# Performance

How the renderer keeps large clusters responsive, what it deliberately does
not do, and how to measure it.

## Pod lookups

`PodStore` (`renderer/components/workloads-pods/store.ts`) indexes its pods by
owner UID, by node and by namespace.

- The indexes live in one MobX `computed`. It is rebuilt in a single pass when
  the pod list changes.
- Lookups cost the size of their answer, not the size of the cluster. This is
  what keeps the workloads overview and the workload status columns fast,
  because they ask for the pods of every workload.
- `getPodsByOwnerId`, `getPodsByNode` and `getPodsByNamespace` return pods in
  store order, as copies that the caller may change.
- `getPodsByNode` returns nothing until the pods are loaded.
- A pod that names the same owner twice is listed once.

`DeploymentStore.getChildPods` matches template labels among the pods of the
Deployment's namespace only.

Code that needs pods by owner, node or namespace uses these lookups rather than
filtering `podStore.items`.

## Watches

`KubeWatchApi` shares one watch per store and namespace between all
subscribers. It counts references and stops the watch when the last subscriber
leaves. Events are buffered and applied once per flush, in time linear in the
store and the batch.

When a watch fails, `KubeObjectStore` retries it with a growing wait
(`watchRetryDelay`).

- The first wait is 5 seconds. Each further failure doubles it, up to one
  minute.
- A random share of up to 25% is taken off each wait, so that watches that
  failed together do not all retry at the same moment.
- When data arrives again, the next failure starts back at 5 seconds.

While any watch of a list is interrupted, the list's header shows a "sync
problem" icon. Its tooltip says that the data may be out of date and that
ProLens is reconnecting.

## Logs

Lists and log tabs are virtualized with react-window.

- A single-pod log tab keeps at most `maxSinglePodLogLines` lines (250,000),
  the newest ones. This applies both to the number of lines requested and to
  the lines kept.
- Combined tabs have their own limit.

## Preferences and other stores

A persistent store writes its whole state in one `set`, which conf saves
atomically. Keys that the store does not own are kept.

If a store file is not valid JSON, the main process renames it to
`<file>.invalid-<timestamp>` and starts that store from its defaults.

- Nothing is deleted, so the file can be restored by hand.
- If the rename fails, the original error is raised.
- Other errors, such as permission errors, are never handled this way.

## Bundle

The renderer build marks `@kubernetes/client-node` as free of side effects
(`sideEffectFreePackagesPlugin` in `freelens/electron.vite.config.ts`), so the
bundler drops the parts the renderer does not use. Add a package to that list
only when importing it runs no code that the renderer relies on.

## Not done, and why

- **Lazy-loading Monaco.** Monaco is a host singleton of the extension API, so
  extensions import it and must get the same instance.
- **Lazy-loading pages.** Pages are registered through DI when the renderer
  starts. Loading them on demand would need a different way to register them.
- **Changes to Electron security settings.** Context isolation is its own
  piece of work (ARCH-3). Performance work does not change window settings or
  the proxy.

## Measuring

```sh
pnpm bench
```

This runs `packages/core/src/renderer/components/__tests__/large-cluster.benchmark.test.ts`.

- It builds two synthetic clusters:
  - medium: 50 namespaces, 1,000 Deployments, about 6,600 pods;
  - large: 200 namespaces, 5,000 Deployments, about 40,000 pods.
- It times the workloads overview, ReplicaSet statuses, the node and namespace
  lookups, and a watch flush.
- Each scenario runs twice: once with the current lookups and once with the
  full-scan implementations swapped back in, for comparison.
- The run takes several minutes, almost all of it in the full-scan comparison
  at the large size.
- Set `PROLENS_BENCH_OUT=<file>` to also write the results table to a file.

Without `PROLENS_BENCH=1`, which `pnpm bench` sets, `pnpm test:unit` skips the
benchmark.
