/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { gatewayClassInfo } from "./model";

import type { DiscoveredResource } from "./discovery";
import type { GatewayApiObject } from "./model";

export const ciliumGatewayController = "io.cilium/gateway-controller";
export const ciliumGroup = "cilium.io";

export interface ServiceLike {
  readonly metadata: { readonly name: string; readonly namespace?: string; readonly selfLink?: string };
}

export interface CiliumIntegration {
  /** GatewayClasses implemented by Cilium. */
  readonly gatewayClasses: string[];
  readonly isGatewayController: boolean;
  /** Whether discovery serves the cilium.io group at all. */
  readonly ciliumInstalled: boolean;
  readonly envoyConfigsAvailable: boolean;
  readonly networkPoliciesAvailable: boolean;
  readonly hubbleRelay?: ServiceLike;
  readonly hubbleUi?: ServiceLike;
}

/**
 * What of Cilium the cluster offers next to its Gateway API resources. Nothing
 * here is assumed: every feature is reported only when the cluster shows it.
 */
export const detectCilium = (input: {
  readonly gatewayClasses: readonly GatewayApiObject[];
  readonly knownResources: readonly DiscoveredResource[];
  readonly services: readonly ServiceLike[];
}): CiliumIntegration => {
  const gatewayClasses = input.gatewayClasses
    .filter((gatewayClass) => gatewayClassInfo(gatewayClass).controllerName === ciliumGatewayController)
    .map((gatewayClass) => gatewayClass.metadata.name);
  const serves = (plural: string) =>
    input.knownResources.some((resource) => resource.group === ciliumGroup && resource.apiName === plural);
  const service = (name: string) => input.services.find((candidate) => candidate.metadata.name === name);

  return {
    gatewayClasses,
    isGatewayController: gatewayClasses.length > 0,
    ciliumInstalled: input.knownResources.some((resource) => resource.group === ciliumGroup),
    envoyConfigsAvailable: serves("ciliumenvoyconfigs"),
    networkPoliciesAvailable: serves("ciliumnetworkpolicies"),
    hubbleRelay: service("hubble-relay"),
    hubbleUi: service("hubble-ui"),
  };
};

/** Cilium names the Service and CiliumEnvoyConfig of a Gateway after it. */
export const ciliumGatewayResourceName = (gatewayName: string) => `cilium-gateway-${gatewayName}`;

/** A `hubble observe` command that follows the traffic of a Gateway. */
export const hubbleObserveCommand = (namespace: string, gatewayName: string) =>
  `hubble observe --namespace ${namespace} --to-service ${namespace}/${ciliumGatewayResourceName(gatewayName)} --follow`;
