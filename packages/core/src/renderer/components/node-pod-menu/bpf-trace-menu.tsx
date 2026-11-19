/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { Node, Pod } from "@freelensapp/kube-object";
import { withInjectables } from "@ogre-tools/injectable-react";
import React from "react";
import { v4 as uuidv4 } from "uuid";
import isWindowsInjectable from "../../../common/vars/is-windows.injectable";
import { App } from "../../../extensions/common-api";
import { findOptimalDefaultContainer } from "../dock/logs/default-container-helper";
import createTerminalTabInjectable from "../dock/terminal/create-terminal-tab.injectable";
import sendCommandInjectable, { type SendCommand } from "../dock/terminal/send-command.injectable";
import hideDetailsInjectable, { type HideDetails } from "../kube-detail-params/hide-details.injectable";
import { MenuItem, SubMenu } from "../menu";
import {
  type BpfTracePreset,
  type BpfTraceTarget,
  buildBpfTraceListCommand,
  buildBpfTraceRunCommand,
  nodeBpfTracePresets,
  podBpfTracePresets,
} from "./bpf-trace-command";

import type { DockTabCreateSpecific } from "../dock/dock/store";

export interface BpfTraceMenuProps {
  object: any;
  toolbar: boolean;
}

interface Dependencies {
  createTerminalTab: (tabParams: DockTabCreateSpecific) => void;
  sendCommand: SendCommand;
  hideDetails: HideDetails;
  isWindows: boolean;
}

interface BpfTraceSubMenuProps {
  target: BpfTraceTarget;
  presets: readonly BpfTracePreset[];
  toolbar: boolean;
}

const NonInjectedBpfTraceSubMenu: React.FC<BpfTraceSubMenuProps & Dependencies> = (props) => {
  const { target, presets, toolbar, createTerminalTab, sendCommand, hideDetails, isWindows } = props;
  const kubectlPath = App.Preferences.getKubectlPath() || "kubectl";
  const shell = isWindows ? "powershell" : "posix";
  const targetLabel =
    target.kind === "pod"
      ? `${target.kind}/${target.name} (namespace: ${target.namespace})`
      : `${target.kind}/${target.name}`;

  // A command run with `enter: false` stays on the prompt for the user to edit.
  const runInTerminal = (title: string, command: string, enter: boolean) => {
    const tabId = uuidv4();

    createTerminalTab({ title, id: tabId });
    sendCommand(command, { enter, tabId }).then(hideDetails);
  };

  const runPreset = (program?: string) => {
    runInTerminal(
      `bpftrace: ${targetLabel}`,
      buildBpfTraceRunCommand(target, { kubectlPath, shell, program }),
      program !== undefined,
    );
  };

  return (
    <MenuItem
      onClick={(evt) => {
        // The parent item only opens the sub-menu.
        evt.stopPropagation();
      }}
      title="Runs bpftrace through the kubectl-trace plugin (kubectl krew install trace)"
    >
      <Icon material="bug_report" interactive={toolbar} tooltip={toolbar && "BPF Trace"} />
      <span className="title">BPF Trace</span>
      <Icon className="arrow" material="keyboard_arrow_right" />
      <SubMenu>
        {presets.map((preset) => (
          <MenuItem key={preset.name} title={preset.description} onClick={() => runPreset(preset.program)}>
            <span className="title">{preset.name}</span>
          </MenuItem>
        ))}
        <MenuItem
          title="Puts a kubectl trace command on the terminal prompt for you to write the program"
          onClick={() => runPreset()}
        >
          <span className="title">Custom program…</span>
        </MenuItem>
        <MenuItem
          title="List the trace jobs in the cluster"
          onClick={() => runInTerminal("bpftrace: trace runs", buildBpfTraceListCommand(kubectlPath), true)}
        >
          <span className="title">List trace runs</span>
        </MenuItem>
      </SubMenu>
    </MenuItem>
  );
};

const BpfTraceSubMenu = withInjectables<Dependencies, BpfTraceSubMenuProps>(NonInjectedBpfTraceSubMenu, {
  getProps: (di, props) => ({
    ...props,
    createTerminalTab: di.inject(createTerminalTabInjectable),
    sendCommand: di.inject(sendCommandInjectable),
    hideDetails: di.inject(hideDetailsInjectable),
    isWindows: di.inject(isWindowsInjectable),
  }),
});

export const NodeBpfTraceMenu: React.FC<BpfTraceMenuProps> = ({ object, toolbar }) => {
  if (!object) return null;
  let node: Node;

  try {
    node = new Node(object);
  } catch {
    return null;
  }

  // bpftrace runs on Linux only.
  if (node.getOperatingSystem() === "windows") return null;

  return (
    <BpfTraceSubMenu target={{ kind: "node", name: node.getName() }} presets={nodeBpfTracePresets} toolbar={toolbar} />
  );
};

export const PodBpfTraceMenu: React.FC<BpfTraceMenuProps> = ({ object, toolbar }) => {
  if (!object) return null;
  let pod: Pod;

  try {
    pod = new Pod(object);
  } catch {
    return null;
  }

  // kubectl-trace needs the node of the pod and the pid of a running container.
  if (pod.getSelectedNodeOs() === "windows" || !pod.getNodeName()) return null;

  // kubectl-trace resolves the pid of regular containers only, not of init or ephemeral ones.
  const containers = pod.getRunningContainersWithType().filter((container) => container.type === "containers");
  const container = findOptimalDefaultContainer(containers, pod.metadata.annotations);

  if (!container) return null;

  return (
    <BpfTraceSubMenu
      target={{ kind: "pod", name: pod.getName(), namespace: pod.getNs(), container: container.name }}
      presets={podBpfTracePresets}
      toolbar={toolbar}
    />
  );
};
