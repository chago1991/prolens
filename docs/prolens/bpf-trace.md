# BPF Trace

The context menu of a Linux node, and of a pod with a running container, has a
**BPF Trace** sub-menu. Each entry opens a terminal tab and runs
[bpftrace](https://github.com/bpftrace/bpftrace) on the node through the
[kubectl-trace](https://github.com/iovisor/kubectl-trace) plugin of kubectl.
The program runs in a privileged Job on the node, so it works from any
desktop platform.

## Requirements

- The kubectl-trace plugin where the terminal finds kubectl plugins:
  `kubectl krew install trace`. Without it the terminal shows
  `unknown command "trace"`.
- Permission to create Jobs in the namespace of the kubeconfig context, which
  is where kubectl-trace creates the trace Job.
- That namespace must admit privileged pods. A namespace that enforces the
  `restricted` or `baseline` Pod Security level rejects the Job; use one
  labelled `pod-security.kubernetes.io/enforce=privileged`.
- Programs that read tracepoint arguments or kernel structures need kernel
  headers on the node, which the init container of kubectl-trace fetches, or a
  kernel with BTF. The `kprobe` presets work without either.

## Entries

| Entry           | Runs                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| Node presets    | execsnoop, opensnoop, tcpconnect, system calls per process, block I/O sizes |
| Pod presets     | the same kinds of trace, limited to the main process of the container       |
| Custom program… | puts `kubectl trace run … -e ''` on the prompt, not run, to fill in         |
| List trace runs | `kubectl trace get --all-namespaces`                                        |

The trace runs with `--attach`, so its output streams into the tab. Ctrl-C
stops bpftrace, which then prints its maps (the counts and the histogram), and
the Job ends. A trace left running ends at the kubectl-trace deadline.

A pod is traced through its default container: the one named by the
`kubectl.kubernetes.io/default-container` annotation, otherwise the first
running one. kubectl-trace gives the program the pid of that container's main
process as `$container_pid`, and the pod presets filter on it: they see the
main process, and its direct children for new processes, but not processes
started with `kubectl exec`.

On Windows the command is quoted for PowerShell.
