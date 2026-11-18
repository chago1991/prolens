/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { gatewayApiGroups, gatewayApiKinds } from "./kinds";

import type { GatewayApiKindDefinition, GatewayApiResourceId } from "./kinds";

/** What API discovery reports about a resource (the shape of `KubeApiResource`). */
export interface DiscoveredResource {
  readonly kind: string;
  readonly group: string;
  readonly version: string;
  readonly apiName: string;
  readonly namespaced: boolean;
}

/** What the CustomResourceDefinition of a resource adds, when the user may read it. */
export interface GatewayApiCrdInfo {
  readonly group: string;
  readonly plural: string;
  readonly annotations: Readonly<Partial<Record<string, string>>>;
  /** `undefined` when the definition has no `Established` condition yet. */
  readonly established?: boolean;
  readonly servedVersions: readonly string[];
}

export type GatewayApiChannel = "standard" | "experimental";

/**
 * Why a resource is or is not shown:
 * - `supported`: served by discovery, established and listable.
 * - `not-installed`: discovery does not serve it.
 * - `forbidden`: served, but the user may not list it.
 * - `not-established`: served, but its definition is not established.
 */
export type GatewayApiResourceState = "supported" | "not-installed" | "forbidden" | "not-established";

export interface GatewayApiResourceStatus {
  readonly definition: GatewayApiKindDefinition;
  readonly state: GatewayApiResourceState;
  readonly group?: string;
  readonly plural?: string;
  readonly kind?: string;
  /** The preferred version, as discovery orders them. */
  readonly version?: string;
  /** Every version discovery serves, preferred first. */
  readonly versions: readonly string[];
  readonly namespaced?: boolean;
  readonly channel?: GatewayApiChannel;
  readonly bundleVersion?: string;
}

export interface GatewayApiDiscovery {
  /** Whether discovery serves any resource of the Gateway API. */
  readonly installed: boolean;
  readonly resources: readonly GatewayApiResourceStatus[];
  /** The bundle version of the installed CRDs, when they agree on one. */
  readonly bundleVersion?: string;
  readonly channel?: GatewayApiChannel;
}

export interface DiscoverGatewayApiInput {
  readonly knownResources: readonly DiscoveredResource[];
  /** Whether RBAC allows the user to list the resource (see `resourcesToShow`). */
  readonly isAllowed: (group: string, plural: string) => boolean;
  /** Definitions the user may read; empty when the list was refused. */
  readonly crds: readonly GatewayApiCrdInfo[];
}

export const channelAnnotation = "gateway.networking.k8s.io/channel";
export const bundleVersionAnnotation = "gateway.networking.k8s.io/bundle-version";

export const apiBaseOf = (group: string, version: string, plural: string) => `/apis/${group}/${version}/${plural}`;

const toChannel = (value: string | undefined): GatewayApiChannel | undefined =>
  value === "standard" || value === "experimental" ? value : undefined;

const agreed = <T>(values: readonly (T | undefined)[]): T | undefined => {
  const defined = [...new Set(values.filter((value): value is T => value !== undefined))];

  return defined.length === 1 ? defined[0] : undefined;
};

/**
 * Which Gateway API resources the cluster serves and the user may use, in
 * which versions. Versions come from discovery, which lists the versions of a
 * group in the order of the server's preference, never from a fixed list.
 * A definition that exists is not enough: discovery has to serve the resource,
 * the definition (when readable) has to be established, and RBAC has to allow
 * listing it.
 */
export const discoverGatewayApi = ({
  knownResources,
  isAllowed,
  crds,
}: DiscoverGatewayApiInput): GatewayApiDiscovery => {
  const relevant = knownResources.filter(
    (resource) => gatewayApiGroups.includes(resource.group) && !resource.apiName.includes("/"),
  );

  const resources = gatewayApiKinds.map((definition): GatewayApiResourceStatus => {
    for (const candidate of definition.candidates) {
      const served = relevant.filter(
        (resource) => resource.group === candidate.group && resource.apiName === candidate.plural,
      );

      if (served.length === 0) continue;

      const [preferred] = served;
      const crd = crds.find((info) => info.group === candidate.group && info.plural === candidate.plural);
      const versions = [...new Set(served.map((resource) => resource.version))];
      const base = {
        definition,
        group: candidate.group,
        plural: candidate.plural,
        kind: preferred.kind,
        version: preferred.version,
        versions,
        namespaced: preferred.namespaced,
        channel: toChannel(crd?.annotations[channelAnnotation]),
        bundleVersion: crd?.annotations[bundleVersionAnnotation],
      };

      if (crd?.established === false) {
        return { ...base, state: "not-established" };
      }

      if (!isAllowed(candidate.group, candidate.plural)) {
        return { ...base, state: "forbidden" };
      }

      return { ...base, state: "supported" };
    }

    return { definition, state: "not-installed", versions: [] };
  });

  const installed = resources.filter((resource) => resource.state !== "not-installed");

  return {
    installed: installed.length > 0,
    resources,
    bundleVersion: agreed(installed.map((resource) => resource.bundleVersion)),
    channel: installed.some((resource) => resource.channel === "experimental")
      ? "experimental"
      : agreed(installed.map((resource) => resource.channel)),
  };
};

export const findResourceStatus = (discovery: GatewayApiDiscovery, id: GatewayApiResourceId) =>
  discovery.resources.find((resource) => resource.definition.id === id);

export const isSupported = (discovery: GatewayApiDiscovery, id: GatewayApiResourceId) =>
  findResourceStatus(discovery, id)?.state === "supported";

/** The API bases to look a store up by, the preferred version first. */
export const apiBasesOf = (status: GatewayApiResourceStatus) =>
  status.group && status.plural
    ? status.versions.map((version) => apiBaseOf(status.group as string, version, status.plural as string))
    : [];
