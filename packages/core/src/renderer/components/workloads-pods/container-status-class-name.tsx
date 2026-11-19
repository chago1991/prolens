import type { ContainerWithType, EphemeralContainerWithType, PodContainerStatus } from "@freelensapp/kube-object";

/** Waiting reasons of a container that will not start without a change. */
const failingWaitingReasons = new Set([
  "ErrImagePull",
  "ImagePullBackOff",
  "InvalidImageName",
  "CreateContainerConfigError",
  "CreateContainerError",
  "RunContainerError",
]);

export function containerStatusClassName(
  container: ContainerWithType | EphemeralContainerWithType,
  status?: PodContainerStatus,
) {
  const state = status ? Object.keys(status?.state ?? {})[0] : "";
  const lastState = status ? Object.keys(status?.lastState ?? {})[0] : "";

  const waitingReason = status?.state?.waiting?.reason;
  const exitCode = status?.state?.terminated?.exitCode;

  if (waitingReason === "CrashLoopBackOff") {
    return "crash-loop-back-off";
  } else if (waitingReason && failingWaitingReasons.has(waitingReason)) {
    return "error";
  } else if (state === "terminated" && exitCode !== undefined && exitCode !== 0) {
    return "error";
  } else if (state === "terminated") {
    return "terminated";
  } else if (container.type === "ephemeralContainers" && lastState === "terminated") {
    return "terminated";
  } else if (container.type === "ephemeralContainers") {
    return "container-ephemeral";
  } else if (status?.ready && status?.restartCount > 0) {
    return "restarted";
  } else if (status?.ready) {
    return "running";
  } else if (state === "running") {
    return "waiting";
  } else {
    return state;
  }
}
