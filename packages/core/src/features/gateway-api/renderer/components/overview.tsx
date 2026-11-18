/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Icon } from "@freelensapp/icon";
import { cssNames } from "@freelensapp/utilities";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observer } from "mobx-react";
import { SiblingsInTabLayout } from "../../../../renderer/components/layout/siblings-in-tab-layout";
import { detectCilium } from "../../common/cilium";
import { gatewayApiInstallUrl, gatewayApiKinds } from "../../common/kinds";
import { gatewayClassInfo, healthOfConditions } from "../../common/model";
import gatewayApiViewDependenciesInjectable, { asGatewayApiObject } from "../view-dependencies.injectable";
import styles from "./gateway-api.module.scss";
import { HealthBadge, LinkButton, Section, useSubscribedStores } from "./shared";

import type { GatewayApiResourceStatus } from "../../common/discovery";
import type { GatewayApiKindDefinition } from "../../common/kinds";
import type { Health } from "../../common/model";
import type { GatewayApiViewDependencies } from "../view-dependencies.injectable";

const installCommand =
  "kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/standard-install.yaml";
const experimentalCommand =
  "kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/experimental-install.yaml";

const stateHealth: Record<GatewayApiResourceStatus["state"], Health> = {
  supported: "healthy",
  forbidden: "warning",
  "not-established": "warning",
  "not-installed": "unknown",
};

const stateLabel: Record<GatewayApiResourceStatus["state"], string> = {
  supported: "Available",
  forbidden: "No permission",
  "not-established": "Not established",
  "not-installed": "Not installed",
};

export const InstallGuidance = ({ experimental }: { experimental?: boolean }) => (
  <div>
    <p>Install the Gateway API CRDs of the standard channel:</p>
    <code className={styles.code}>{installCommand}</code>
    {experimental && (
      <>
        <p>TCP, UDP and TLS routes and ListenerSets need the experimental channel:</p>
        <code className={styles.code}>{experimentalCommand}</code>
      </>
    )}
    <p className={styles.muted}>
      A Gateway API controller (such as Cilium, Envoy Gateway, Istio or NGINX Gateway Fabric) has to be installed as
      well. See {gatewayApiInstallUrl}.
    </p>
  </div>
);

/** The empty state of a list whose resource the cluster does not offer the user. */
export const GatewayApiUnavailable = ({
  definition,
  status,
}: {
  definition: GatewayApiKindDefinition;
  status: GatewayApiResourceStatus | undefined;
  deps: GatewayApiViewDependencies;
}) => (
  <div className={cssNames(styles.page, styles.empty)} data-testid="gateway-api-unavailable">
    <Icon material={definition.icon} big />
    <h2>{definition.title}</h2>
    {status?.state === "forbidden" ? (
      <p>
        The cluster serves {status.group}/{status.version} {status.plural}, but your RBAC permissions do not allow
        listing them. Ask a cluster administrator for <span className={styles.mono}>list</span> and{" "}
        <span className={styles.mono}>watch</span> on this resource.
      </p>
    ) : status?.state === "not-established" ? (
      <p>The CustomResourceDefinition of {definition.kind} exists but is not established yet, so it is not shown.</p>
    ) : status?.state === "supported" ? (
      <p>Loading the API of {definition.kind}…</p>
    ) : (
      <>
        <p>The cluster does not serve {definition.kind}.</p>
        <InstallGuidance
          experimental={["tcproutes", "udproutes", "tlsroutes", "listenersets"].includes(definition.id)}
        />
      </>
    )}
  </div>
);

interface Dependencies {
  deps: GatewayApiViewDependencies;
}

const NonInjectedGatewayApiOverview = observer(({ deps }: Dependencies) => {
  const discovery = deps.gatewayApi.discovery.get();
  const classesStore = deps.gatewayApi.storeOf("gatewayclasses");
  const gatewaysStore = deps.gatewayApi.storeOf("gateways");

  useSubscribedStores(deps.subscribeStores, [classesStore, gatewaysStore, deps.serviceStore]);

  const classes = (classesStore?.items ?? []).map(asGatewayApiObject);
  const cilium = detectCilium({
    gatewayClasses: classes,
    knownResources: deps.knownResources(),
    services: (deps.serviceStore.items ?? []).map(asGatewayApiObject),
  });
  const controllers = [
    ...new Set(classes.map((gatewayClass) => gatewayClassInfo(gatewayClass).controllerName ?? "unknown")),
  ];

  return (
    <SiblingsInTabLayout>
      <div className={cssNames(styles.page, styles.root)} data-testid="gateway-api-overview">
        <h2>Gateway API</h2>
        {!discovery.installed ? (
          <div className={styles.empty} data-testid="gateway-api-not-installed">
            <Icon material="router" big />
            <p>The Gateway API is not installed in this cluster.</p>
            <InstallGuidance experimental />
          </div>
        ) : (
          <>
            <p className={styles.muted}>
              {discovery.bundleVersion ? `Bundle ${discovery.bundleVersion}` : "Bundle version unknown"}
              {discovery.channel ? ` · ${discovery.channel} channel` : ""}
              {!deps.gatewayApi.definitionsReadable.get() && " · CRDs not readable, versions from API discovery"}
            </p>
            <div className={styles.grid}>
              {gatewayApiKinds.map((definition) => {
                const status = deps.gatewayApi.status(definition.id);
                const state = status?.state ?? "not-installed";
                const supported = state === "supported";
                const count = supported ? deps.gatewayApi.storeOf(definition.id)?.items.length : undefined;

                return (
                  <button
                    key={definition.id}
                    type="button"
                    className={cssNames(styles.card, styles.tile)}
                    aria-disabled={!supported}
                    onClick={supported ? () => deps.navigateToResources(definition.id) : undefined}
                    data-testid={`gateway-api-tile-${definition.id}`}
                  >
                    <div className={styles.tileTitle}>
                      <Icon material={definition.icon} small />
                      {definition.title}
                    </div>
                    <div className={styles.muted}>{definition.description}</div>
                    <div>
                      <HealthBadge health={stateHealth[state]} label={stateLabel[state]} />{" "}
                      {status?.version && (
                        <span className={styles.chip}>
                          {status.group === "gateway.networking.k8s.io" ? "" : `${status.group}/`}
                          {status.version}
                        </span>
                      )}
                      {count !== undefined && classesStore && <span className={styles.chip}>{count} objects</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <Section title="Controllers">
              {classes.length === 0 ? (
                <div className={styles.muted}>No GatewayClasses are visible.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">GatewayClass</th>
                      <th scope="col">Controller</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((gatewayClass) => {
                      const info = gatewayClassInfo(gatewayClass);

                      return (
                        <tr key={gatewayClass.metadata.name}>
                          <td>
                            <LinkButton onClick={() => deps.showDetails(gatewayClass.metadata.selfLink)}>
                              {gatewayClass.metadata.name}
                            </LinkButton>
                          </td>
                          <td className={styles.mono}>{info.controllerName}</td>
                          <td>
                            <HealthBadge
                              health={healthOfConditions(info.conditions, gatewayClass.metadata.generation)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {controllers.length > 1 && (
                <div className={styles.muted}>
                  {controllers.length} controllers implement Gateway API in this cluster.
                </div>
              )}
            </Section>

            {(cilium.isGatewayController || cilium.ciliumInstalled) && (
              <Section title="Cilium">
                <div>
                  {cilium.isGatewayController ? (
                    <>
                      Cilium is the Gateway API controller of{" "}
                      {cilium.gatewayClasses.map((name) => (
                        <span key={name} className={styles.chip}>
                          {name}
                        </span>
                      ))}
                    </>
                  ) : (
                    "Cilium is installed but implements none of the visible GatewayClasses."
                  )}
                </div>
                <ul>
                  <li>CiliumEnvoyConfig: {cilium.envoyConfigsAvailable ? "available" : "not served"}</li>
                  <li>CiliumNetworkPolicy: {cilium.networkPoliciesAvailable ? "available" : "not served"}</li>
                  <li>
                    Hubble Relay:{" "}
                    {cilium.hubbleRelay ? (
                      <LinkButton onClick={() => deps.showDetails(cilium.hubbleRelay?.metadata.selfLink)}>
                        found
                      </LinkButton>
                    ) : (
                      "not found in the visible namespaces"
                    )}
                  </li>
                  <li>
                    Hubble UI:{" "}
                    {cilium.hubbleUi ? (
                      <LinkButton onClick={() => deps.showDetails(cilium.hubbleUi?.metadata.selfLink)}>
                        open Service (port forward to view flows)
                      </LinkButton>
                    ) : (
                      "not found in the visible namespaces"
                    )}
                  </li>
                </ul>
              </Section>
            )}

            {discovery.resources.some((resource) => resource.state === "not-installed") && (
              <Section title="Not installed">
                <InstallGuidance
                  experimental={discovery.resources.some(
                    (resource) =>
                      resource.state === "not-installed" &&
                      ["tcproutes", "udproutes", "tlsroutes", "listenersets"].includes(resource.definition.id),
                  )}
                />
              </Section>
            )}
          </>
        )}
      </div>
    </SiblingsInTabLayout>
  );
});

export const GatewayApiOverview = withInjectables<Dependencies>(NonInjectedGatewayApiOverview, {
  getProps: (di) => ({ deps: di.inject(gatewayApiViewDependenciesInjectable) }),
});
