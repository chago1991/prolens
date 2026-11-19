/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildBpfTraceListCommand,
  buildBpfTraceRunCommand,
  nodeBpfTracePresets,
  podBpfTracePresets,
  quoteForShell,
} from "../bpf-trace-command";

describe("bpf-trace-command", () => {
  describe("quoteForShell", () => {
    it("wraps a value in single quotes", () => {
      expect(quoteForShell('a "b" $c\\n', "posix")).toBe(`'a "b" $c\\n'`);
      expect(quoteForShell('a "b" $c\\n', "powershell")).toBe(`'a "b" $c\\n'`);
    });

    it("escapes single quotes for a POSIX shell", () => {
      expect(quoteForShell("it's", "posix")).toBe(`'it'\\''s'`);
    });

    it("doubles single quotes for PowerShell", () => {
      expect(quoteForShell("it's", "powershell")).toBe("'it''s'");
    });

    it.runIf(process.platform !== "win32").each([...nodeBpfTracePresets, ...podBpfTracePresets, { program: "it's" }])(
      "survives sh unchanged: $program",
      ({ program }) => {
        const echoed = execFileSync("/bin/sh", ["-c", `printf %s ${quoteForShell(program, "posix")}`], {
          encoding: "utf8",
        });

        expect(echoed).toBe(program);
      },
    );
  });

  describe("buildBpfTraceRunCommand", () => {
    it("traces a node attached to the terminal", () => {
      expect(
        buildBpfTraceRunCommand(
          { kind: "node", name: "worker-1" },
          { kubectlPath: "kubectl", shell: "posix", program: "kprobe:tcp_connect { }" },
        ),
      ).toBe("kubectl trace run 'node/worker-1' --attach -e 'kprobe:tcp_connect { }'");
    });

    it("names the namespace and container of a pod without moving the trace job there", () => {
      expect(
        buildBpfTraceRunCommand(
          { kind: "pod", name: "web-0", namespace: "shop", container: "app" },
          { kubectlPath: "/opt/kubectl", shell: "posix", program: "p" },
        ),
      ).toBe("/opt/kubectl trace run 'pod/web-0' --target-namespace 'shop' --container 'app' --attach -e 'p'");
    });

    it("leaves out the container when none is given", () => {
      expect(
        buildBpfTraceRunCommand(
          { kind: "pod", name: "web-0", namespace: "shop" },
          { kubectlPath: "kubectl", shell: "posix" },
        ),
      ).toBe("kubectl trace run 'pod/web-0' --target-namespace 'shop' --attach -e ''");
    });

    it("quotes for PowerShell on Windows", () => {
      expect(
        buildBpfTraceRunCommand(
          { kind: "node", name: "n" },
          { kubectlPath: "kubectl", shell: "powershell", program: "printf('x')" },
        ),
      ).toBe("kubectl trace run 'node/n' --attach -e 'printf(''x'')'");
    });
  });

  it("lists trace runs in every namespace", () => {
    expect(buildBpfTraceListCommand("kubectl")).toBe("kubectl trace get --all-namespaces");
  });

  it("scopes every pod preset to the container", () => {
    for (const preset of podBpfTracePresets) {
      expect(preset.program).toContain("$container_pid");
    }
  });
});
