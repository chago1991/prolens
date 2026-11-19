/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * bpftrace programs and command lines for kubectl-trace
 * (https://github.com/iovisor/kubectl-trace).
 *
 * kubectl-trace runs the program in a privileged Job on the node of the
 * target, so it works from any desktop platform. Pod targets get the
 * `$container_pid` variable: the pid, in the node's pid namespace, of the
 * root process of the chosen container. Only that process is known, so the
 * pod programs filter on it or on its direct children.
 */

export interface BpfTracePreset {
  /** Menu label */
  name: string;
  /** Tooltip */
  description: string;
  /** bpftrace program */
  program: string;
}

export const nodeBpfTracePresets: readonly BpfTracePreset[] = [
  {
    name: "New processes (execsnoop)",
    description: "Print every command executed on the node",
    program: 'tracepoint:syscalls:sys_enter_execve { printf("%-6d %-16s ", pid, comm); join(args->argv); }',
  },
  {
    name: "Opened files (opensnoop)",
    description: "Print the files opened on the node and the process opening them",
    program: 'tracepoint:syscalls:sys_enter_openat { printf("%-6d %-16s %s\\n", pid, comm, str(args->filename)); }',
  },
  {
    name: "TCP connections (tcpconnect)",
    description: "Print the processes opening outbound TCP connections",
    program: 'kprobe:tcp_connect { printf("%-6d %s\\n", pid, comm); }',
  },
  {
    name: "Syscall count by process",
    description: "Count system calls per process; the summary prints on Ctrl-C",
    program: "tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }",
  },
  {
    name: "Disk I/O size histogram",
    description: "Histogram of block I/O request sizes; prints on Ctrl-C",
    program: "tracepoint:block:block_rq_issue { @bytes = hist(args->bytes); }",
  },
];

export const podBpfTracePresets: readonly BpfTracePreset[] = [
  {
    name: "Processes started by the main process",
    description: "Print the commands executed by direct children of the container's main process",
    program:
      'tracepoint:syscalls:sys_enter_execve /curtask->real_parent->tgid == $container_pid/ { printf("%-6d %-16s ", pid, comm); join(args->argv); }',
  },
  {
    name: "Files opened by the main process",
    description: "Print the files opened by the container's main process",
    program: 'tracepoint:syscalls:sys_enter_openat /pid == $container_pid/ { printf("%s\\n", str(args->filename)); }',
  },
  {
    name: "TCP connections of the main process",
    description: "Print the outbound TCP connections opened by the container's main process",
    program: 'kprobe:tcp_connect /pid == $container_pid/ { printf("%-6d %s\\n", tid, comm); }',
  },
  {
    name: "Syscall count of the main process",
    description: "Count system calls of the container's main process by name; the summary prints on Ctrl-C",
    program: "tracepoint:syscalls:sys_enter_* /pid == $container_pid/ { @[probe] = count(); }",
  },
];

export type ShellFlavour = "posix" | "powershell";

/**
 * Quotes a value as one literal word: POSIX shells and PowerShell expand
 * nothing inside single quotes, which keeps `$container_pid`, `"` and `\n`
 * intact for bpftrace.
 */
export function quoteForShell(value: string, shell: ShellFlavour): string {
  if (shell === "powershell") {
    return `'${value.replace(/'/g, "''")}'`;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export type BpfTraceTarget =
  | { kind: "node"; name: string }
  | { kind: "pod"; name: string; namespace: string; container?: string };

export interface BpfTraceCommandOptions {
  kubectlPath: string;
  shell: ShellFlavour;
  /** The bpftrace program; leave out for an empty program the user fills in */
  program?: string;
}

/**
 * `kubectl trace run` for a target. `--attach` streams the output into the
 * terminal and passes Ctrl-C to bpftrace, which then prints its maps and
 * ends the Job. The Job is created in the namespace of the kubeconfig
 * context; `--target-namespace` names the namespace of the pod only.
 */
export function buildBpfTraceRunCommand(target: BpfTraceTarget, options: BpfTraceCommandOptions): string {
  const { kubectlPath, shell, program = "" } = options;
  const parts = [kubectlPath, "trace", "run", quoteForShell(`${target.kind}/${target.name}`, shell)];

  if (target.kind === "pod") {
    parts.push("--target-namespace", quoteForShell(target.namespace, shell));

    if (target.container) {
      parts.push("--container", quoteForShell(target.container, shell));
    }
  }

  parts.push("--attach", "-e", quoteForShell(program, shell));

  return parts.join(" ");
}

export function buildBpfTraceListCommand(kubectlPath: string): string {
  return `${kubectlPath} trace get --all-namespaces`;
}
