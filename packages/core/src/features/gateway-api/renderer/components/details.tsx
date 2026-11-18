/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Button } from "@freelensapp/button";
import { cssNames } from "@freelensapp/utilities";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observer } from "mobx-react";
import { useMemo, useState } from "react";
import { DrawerItem } from "../../../../renderer/components/drawer";
import { ciliumGatewayResourceName, detectCilium, hubbleObserveCommand } from "../../common/cilium";
import { gatewayApiGroup, getGatewayApiKindOf } from "../../common/kinds";
import {
  backendRefsOf,
  backendTlsPolicyInfo,
  describeFilter,
  describeGrpcMatch,
  describeHttpMatch,
  fromHttpRule,
  fromListener,
  gatewayClassInfo,
  gatewayInfo,
  groupOf,
  hostnamesOf,
  isReferenceGranted,
  list,
  listenerSetInfo,
  parentRefsOf,
  referenceGrantInfo,
  routeParentStatusesOf,
  routeStateFor,
  routeStateHealth,
  rulesOf,
  sameParent,
  toHttpRule,
} from "../../common/model";
import { listenersForParent } from "../../common/topology";
import { useCanI } from "../can-i.injectable";
import gatewayApiViewDependenciesInjectable, { asGatewayApiObject } from "../view-dependencies.injectable";
import styles from "./gateway-api.module.scss";
import { HttpRouteEditor } from "./http-route-editor";
import { ListenerEditor } from "./listener-editor";
import { Chips, ConditionsTable, HealthBadge, LinkButton, Section, useSubscribedStores } from "./shared";

import type { KubeObject } from "@freelensapp/kube-object";

import type { GatewayApiResourceId } from "../../common/kinds";
import type { GatewayApiObject, Listener, ParentRef } from "../../common/model";
import type { AnyKubeObjectStore } from "../gateway-api.injectable";
import type { GatewayApiViewDependencies } from "../view-dependencies.injectable";
import type { HttpRouteDraft } from "./http-route-editor";

interface ViewProps {
  readonly object: KubeObject;
  readonly deps: GatewayApiViewDependencies;
}

const routeIds: GatewayApiResourceId[] = ["httproutes", "grpcroutes", "tcproutes", "tlsroutes", "udproutes"];

const items = (store: AnyKubeObjectStore | undefined) => (store?.items ?? []) as unknown as KubeObject[];

const linkTo = (
  deps: GatewayApiViewDependencies,
  store: AnyKubeObjectStore | undefined,
  name: string,
  namespace?: string,
) => {
  const target = store?.getByName(name, namespace);

  return target ? () => deps.showDetails(target.selfLink) : undefined;
};

const ParentsTable = observer(({ object, deps }: ViewProps) => {
  const route = asGatewayApiObject(object);
  const parents = parentRefsOf(route);
  const statuses = routeParentStatusesOf(route);
  const gateways = deps.gatewayApi.storeOf("gateways");

  if (parents.length === 0)
    return <div className={styles.muted}>The route has no parents and is not attached anywhere.</div>;

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Parent</th>
          <th scope="col">Listeners</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {parents.map((parent, index) => {
          const isGateway = parent.kind === "Gateway" && parent.group === gatewayApiGroup;
          const gateway = isGateway ? gateways?.getByName(parent.name, parent.namespace) : undefined;
          const listeners = gateway
            ? listenersForParent(
                gatewayInfo(asGatewayApiObject(gateway)).listeners,
                parent,
                object.kind,
                hostnamesOf(route),
              )
            : [];
          const conditions = statuses
            .filter((status) => sameParent(status.parentRef, parent))
            .flatMap((status) => status.conditions);
          const state = routeStateFor(route, parent);

          return (
            <tr key={index}>
              <td>
                <LinkButton onClick={gateway ? () => deps.showDetails(gateway.selfLink) : undefined}>
                  {parent.kind} {parent.namespace}/{parent.name}
                  {parent.sectionName ? `:${parent.sectionName}` : ""}
                  {parent.port ? ` port ${parent.port}` : ""}
                </LinkButton>
                {isGateway && gateways && !gateway && <div className={styles.muted}>Not found</div>}
              </td>
              <td>
                {gateway ? (
                  <Chips
                    values={listeners.map((listener) => `${listener.name} (${listener.protocol}:${listener.port})`)}
                    empty="none match"
                  />
                ) : (
                  <span className={styles.muted}>—</span>
                )}
              </td>
              <td>
                <HealthBadge health={routeStateHealth[state]} label={state} />
                {conditions
                  .filter((condition) => condition.status !== "True")
                  .map((condition) => (
                    <div key={condition.type} className={styles.muted}>
                      {condition.type}: {condition.reason}
                      {condition.message ? ` — ${condition.message}` : ""}
                    </div>
                  ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

const BackendsTable = observer(({ object, deps }: ViewProps) => {
  const route = asGatewayApiObject(object);
  const refs = backendRefsOf(route);
  const grants = items(deps.gatewayApi.storeOf("referencegrants")).map(asGatewayApiObject);
  const grantsKnown = deps.gatewayApi.isSupported("referencegrants");

  if (refs.length === 0) return <div className={styles.muted}>No backends.</div>;

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Rule</th>
          <th scope="col">Backend</th>
          <th scope="col">Weight</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {refs.map((ref, index) => {
          const isService = ref.kind === "Service" && ref.group === "";
          const service = isService ? deps.serviceStore.getByName(ref.name, ref.namespace) : undefined;
          const crossNamespace = ref.namespace !== object.getNs();
          const granted =
            !crossNamespace ||
            isReferenceGranted(grants, {
              fromGroup: groupOf(object.apiVersion),
              fromKind: object.kind,
              fromNamespace: object.getNs() ?? "",
              toGroup: ref.group,
              toKind: ref.kind,
              toName: ref.name,
              toNamespace: ref.namespace,
            });
          const problems = [
            isService && deps.serviceStore.isLoaded && !service ? "Service not found" : "",
            !granted
              ? grantsKnown
                ? "No ReferenceGrant permits this"
                : "Cross-namespace; ReferenceGrants not readable"
              : "",
          ].filter(Boolean);

          return (
            <tr key={index}>
              <td>#{ref.ruleIndex + 1}</td>
              <td>
                <LinkButton onClick={service ? () => deps.showDetails(service.selfLink) : undefined}>
                  {ref.kind !== "Service" ? `${ref.kind} ` : ""}
                  {crossNamespace ? `${ref.namespace}/` : ""}
                  {ref.name}
                  {ref.port ? `:${ref.port}` : ""}
                </LinkButton>
              </td>
              <td>
                <span className={styles.weightBar} style={{ width: `${Math.max(2, ref.share * 0.6)}px` }} aria-hidden />
                {ref.share}% <span className={styles.muted}>(w={ref.weight})</span>
              </td>
              <td>
                {problems.length ? (
                  <HealthBadge health="critical" label={problems.join("; ")} />
                ) : (
                  <HealthBadge health="healthy" label="Resolved" />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

const useEditPermission = (deps: GatewayApiViewDependencies, object: KubeObject, resource: string) =>
  useCanI(deps.canI, {
    verb: "patch",
    group: groupOf(object.apiVersion),
    resource,
    namespace: object.getNs(),
    name: object.getName(),
  });

const EditToggle = ({
  editing,
  setEditing,
  label,
}: {
  editing: boolean;
  setEditing: (value: boolean) => void;
  label: string;
}) => <Button plain label={editing ? "Close editor" : label} onClick={() => setEditing(!editing)} />;

// ---------------------------------------------------------------------------

const GatewayClassDetails = observer(({ object, deps }: ViewProps) => {
  const info = gatewayClassInfo(asGatewayApiObject(object));
  const gatewaysStore = deps.gatewayApi.storeOf("gateways");
  const gateways = items(gatewaysStore).filter(
    (gateway) => gatewayInfo(asGatewayApiObject(gateway)).className === object.getName(),
  );
  const cilium = detectCilium({
    gatewayClasses: [asGatewayApiObject(object)],
    knownResources: deps.knownResources(),
    services: [],
  });

  useSubscribedStores(deps.subscribeStores, [gatewaysStore]);

  return (
    <div className={styles.root}>
      <DrawerItem name="Controller">
        <span className={styles.mono}>{info.controllerName ?? "—"}</span>
        {cilium.isGatewayController && <span className={styles.chip}>Cilium</span>}
      </DrawerItem>
      {info.description && <DrawerItem name="Description">{info.description}</DrawerItem>}
      <DrawerItem name="Parameters">
        {info.parametersRef
          ? `${info.parametersRef.kind ?? ""}${info.parametersRef.group ? `.${info.parametersRef.group}` : ""} ${info.parametersRef.namespace ? `${info.parametersRef.namespace}/` : ""}${info.parametersRef.name}`
          : "—"}
      </DrawerItem>
      {info.supportedFeatures.length > 0 && (
        <DrawerItem name="Supported features">
          <Chips values={info.supportedFeatures} />
        </DrawerItem>
      )}
      <Section title="Status">
        <ConditionsTable conditions={info.conditions} empty="The controller has not accepted the class yet." />
      </Section>
      <Section title={`Gateways (${gateways.length})`}>
        {gateways.length ? (
          gateways.map((gateway) => (
            <div key={gateway.getId()}>
              <LinkButton onClick={() => deps.showDetails(gateway.selfLink)}>
                {gateway.getNs()}/{gateway.getName()}
              </LinkButton>
            </div>
          ))
        ) : (
          <div className={styles.muted}>No Gateways use this class.</div>
        )}
      </Section>
    </div>
  );
});

const ListenersTable = ({ listeners, object }: { listeners: readonly Listener[]; object: GatewayApiObject }) => {
  const statuses = new Map(gatewayInfo(object).listenerStatuses.map((status) => [status.name, status]));

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Protocol / port</th>
          <th scope="col">Hostname</th>
          <th scope="col">TLS</th>
          <th scope="col">Routes</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {listeners.map((listener) => {
          const status = statuses.get(listener.name);
          const failing = status?.conditions.filter(
            (condition) => condition.status === (condition.type === "Conflicted" ? "True" : "False"),
          );

          return (
            <tr key={listener.name}>
              <td>{listener.name}</td>
              <td>
                {listener.protocol}:{listener.port}
              </td>
              <td>{listener.hostname ?? <span className={styles.muted}>any</span>}</td>
              <td>
                {listener.tls ? (
                  <>
                    {listener.tls.mode ?? "Terminate"}
                    {listener.tls.certificateRefs.map((ref) => (
                      <div key={`${ref.namespace}/${ref.name}`} className={styles.muted}>
                        {ref.kind ?? "Secret"} {ref.namespace ? `${ref.namespace}/` : ""}
                        {ref.name}
                      </div>
                    ))}
                  </>
                ) : (
                  <span className={styles.muted}>—</span>
                )}
              </td>
              <td>
                {status?.attachedRoutes ?? "—"}
                <div className={styles.muted}>
                  from {listener.allowedRoutes?.namespaces?.from ?? "Same"}
                  {listener.allowedRoutes?.kinds?.length
                    ? `; ${listener.allowedRoutes.kinds.map((kind) => kind.kind).join(", ")}`
                    : ""}
                </div>
              </td>
              <td>
                {status ? (
                  failing?.length ? (
                    failing.map((condition) => (
                      <HealthBadge
                        key={condition.type}
                        health="critical"
                        label={`${condition.type}: ${condition.reason ?? condition.status}`}
                      />
                    ))
                  ) : (
                    <HealthBadge health="healthy" label="Ready" />
                  )
                ) : (
                  <HealthBadge health="unknown" label="No status" />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const CiliumGatewayPanel = observer(({ object, deps }: ViewProps) => {
  const info = gatewayInfo(asGatewayApiObject(object));
  const classes = items(deps.gatewayApi.storeOf("gatewayclasses")).map(asGatewayApiObject);
  const services = items(deps.serviceStore).map(asGatewayApiObject);
  const cilium = detectCilium({ gatewayClasses: classes, knownResources: deps.knownResources(), services });

  if (!info.className || !cilium.gatewayClasses.includes(info.className)) return null;

  const namespace = object.getNs() ?? "default";
  const serviceName = ciliumGatewayResourceName(object.getName());
  const service = deps.serviceStore.getByName(serviceName, namespace);

  return (
    <Section title="Cilium">
      <DrawerItem name="Controller">io.cilium/gateway-controller</DrawerItem>
      <DrawerItem name="Load balancer Service">
        <LinkButton onClick={service ? () => deps.showDetails(service.selfLink) : undefined}>
          {namespace}/{serviceName}
        </LinkButton>
        {!service && deps.serviceStore.isLoaded && <span className={styles.muted}> (not found)</span>}
      </DrawerItem>
      {cilium.envoyConfigsAvailable && (
        <DrawerItem name="CiliumEnvoyConfig">
          <span className={styles.mono}>
            {namespace}/{serviceName}
          </span>
        </DrawerItem>
      )}
      {cilium.hubbleUi && (
        <DrawerItem name="Hubble UI">
          <LinkButton onClick={() => deps.showDetails(cilium.hubbleUi?.metadata.selfLink)}>
            {cilium.hubbleUi.metadata.namespace}/hubble-ui
          </LinkButton>
          <span className={styles.muted}> — open it and use port forwarding to view flows</span>
        </DrawerItem>
      )}
      {cilium.hubbleRelay ? (
        <DrawerItem name="Traffic flows">
          <code className={styles.code}>{hubbleObserveCommand(namespace, object.getName())}</code>
        </DrawerItem>
      ) : (
        <div className={styles.muted}>
          Hubble Relay was not found in the visible namespaces; flow observation is unavailable.
        </div>
      )}
    </Section>
  );
});

const AttachedRoutes = observer(({ object, deps, kindOf }: ViewProps & { kindOf: "Gateway" | "ListenerSet" }) => {
  const stores = routeIds.map((id) => deps.gatewayApi.storeOf(id));
  const routes = stores
    .flatMap(items)
    .filter((route) =>
      parentRefsOf(asGatewayApiObject(route)).some(
        (parent) => parent.kind === kindOf && parent.name === object.getName() && parent.namespace === object.getNs(),
      ),
    );

  useSubscribedStores(deps.subscribeStores, stores);

  return (
    <Section title={`Attached routes (${routes.length})`}>
      {routes.length === 0 ? (
        <div className={styles.muted}>No routes reference this {kindOf}.</div>
      ) : (
        <table className={styles.table}>
          <tbody>
            {routes.map((route) => {
              const parent = parentRefsOf(asGatewayApiObject(route)).find(
                (candidate) => candidate.name === object.getName() && candidate.namespace === object.getNs(),
              ) as ParentRef;
              const state = routeStateFor(asGatewayApiObject(route), parent);

              return (
                <tr key={route.getId()}>
                  <td>{route.kind}</td>
                  <td>
                    <LinkButton onClick={() => deps.showDetails(route.selfLink)}>
                      {route.getNs()}/{route.getName()}
                    </LinkButton>
                  </td>
                  <td>{parent.sectionName ?? <span className={styles.muted}>all listeners</span>}</td>
                  <td>
                    <HealthBadge health={routeStateHealth[state]} label={state} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
});

const GatewayDetails = observer(({ object, deps }: ViewProps) => {
  const gateway = asGatewayApiObject(object);
  const info = gatewayInfo(gateway);
  const classesStore = deps.gatewayApi.storeOf("gatewayclasses");
  const [editing, setEditing] = useState(false);
  const allowed = useEditPermission(deps, object, "gateways");
  const listeners = useMemo(() => info.listeners, [JSON.stringify(gateway.spec)]);
  const listenerSets = items(deps.gatewayApi.storeOf("listenersets")).filter((set) => {
    const parent = listenerSetInfo(asGatewayApiObject(set)).parentRef;

    return parent.name === object.getName() && parent.namespace === object.getNs();
  });

  useSubscribedStores(deps.subscribeStores, [classesStore, deps.serviceStore, deps.gatewayApi.storeOf("listenersets")]);

  return (
    <div className={styles.root}>
      <DrawerItem name="Class">
        <LinkButton onClick={info.className ? linkTo(deps, classesStore, info.className) : undefined}>
          {info.className ?? "—"}
        </LinkButton>
      </DrawerItem>
      <DrawerItem name="Addresses">
        <Chips
          values={info.addresses}
          empty={info.specAddresses.length ? `requested: ${info.specAddresses.join(", ")}` : "not assigned"}
        />
      </DrawerItem>
      <DrawerItem name="Topology">
        <LinkButton onClick={() => deps.navigateToTopology({ gateway: `${object.getNs()}/${object.getName()}` })}>
          Show in Gateway API topology
        </LinkButton>
      </DrawerItem>
      <Section title="Status">
        <ConditionsTable conditions={info.conditions} empty="No controller has reported status yet." />
      </Section>
      <Section
        title={`Listeners (${info.listeners.length})`}
        actions={<EditToggle editing={editing} setEditing={setEditing} label="Edit listeners" />}
      >
        {editing ? (
          <ListenerEditor
            objectName={object.getName()}
            listeners={listeners}
            allowed={allowed}
            protectedTarget={deps.isProtected(object)}
            onApply={(next) =>
              deps.patchSpec(
                deps.gatewayApi.storeOf("gateways"),
                object,
                { listeners: next.map(fromListener) },
                "Replace the listeners",
              )
            }
          />
        ) : (
          <ListenersTable listeners={info.listeners} object={gateway} />
        )}
      </Section>
      {listenerSets.length > 0 && (
        <Section title={`Listener sets (${listenerSets.length})`}>
          {listenerSets.map((set) => (
            <div key={set.getId()}>
              <LinkButton onClick={() => deps.showDetails(set.selfLink)}>
                {set.getNs()}/{set.getName()}
              </LinkButton>{" "}
              <span className={styles.muted}>
                {listenerSetInfo(asGatewayApiObject(set)).listeners.length} listeners
              </span>
            </div>
          ))}
        </Section>
      )}
      <AttachedRoutes object={object} deps={deps} kindOf="Gateway" />
      <CiliumGatewayPanel object={object} deps={deps} />
    </div>
  );
});

const HttpRouteDetails = observer(({ object, deps }: ViewProps) => {
  const route = asGatewayApiObject(object);
  const rules = rulesOf(route).map(toHttpRule);
  const [editing, setEditing] = useState(false);
  const allowed = useEditPermission(deps, object, "httproutes");
  const specKey = JSON.stringify(route.spec);
  const draft = useMemo((): HttpRouteDraft => ({ hostnames: hostnamesOf(route), rules }), [specKey]);

  useSubscribedStores(deps.subscribeStores, [
    deps.gatewayApi.storeOf("gateways"),
    deps.gatewayApi.storeOf("referencegrants"),
    deps.serviceStore,
  ]);

  return (
    <div className={styles.root}>
      <DrawerItem name="Hostnames">
        <Chips values={hostnamesOf(route)} empty="any (from the listener)" />
      </DrawerItem>
      <Section title="Parents">
        <ParentsTable object={object} deps={deps} />
      </Section>
      <Section
        title={`Rules (${rules.length})`}
        actions={<EditToggle editing={editing} setEditing={setEditing} label="Edit routing" />}
      >
        {editing ? (
          <HttpRouteEditor
            objectName={object.getName()}
            value={draft}
            allowed={allowed}
            protectedTarget={deps.isProtected(object)}
            onApply={(next) =>
              deps.patchSpec(
                deps.gatewayApi.storeOf("httproutes"),
                object,
                { hostnames: next.hostnames.length ? next.hostnames : null, rules: next.rules.map(fromHttpRule) },
                "Replace the hostnames and rules",
              )
            }
          />
        ) : (
          rules.map((rule, index) => (
            <div key={index} className={styles.card}>
              <div className={styles.cardHeader}>
                <strong>
                  Rule {index + 1}
                  {rule.name ? ` · ${rule.name}` : ""}
                </strong>
                {rule.timeouts && (
                  <span className={styles.muted}>
                    timeouts: {rule.timeouts.request ?? "—"} / backend {rule.timeouts.backendRequest ?? "—"}
                  </span>
                )}
              </div>
              <div>
                <span className={styles.muted}>Match: </span>
                <Chips values={rule.matches.length ? rule.matches.map(describeHttpMatch) : ["/*"]} />
              </div>
              {rule.filters.length > 0 && (
                <div>
                  <span className={styles.muted}>Filters: </span>
                  <Chips values={rule.filters.map((filter) => describeFilter(filter.raw))} />
                </div>
              )}
              <div>
                <span className={styles.muted}>Backends: </span>
                <Chips
                  values={rule.backendRefs.map(
                    (ref) =>
                      `${ref.namespace ? `${ref.namespace}/` : ""}${ref.name}${ref.port ? `:${ref.port}` : ""}${ref.weight !== undefined ? ` w=${ref.weight}` : ""}`,
                  )}
                  empty={
                    rule.filters.some((filter) => filter.type === "RequestRedirect") ? "redirect only" : "none (500)"
                  }
                />
              </div>
            </div>
          ))
        )}
      </Section>
      <Section title="Backends">
        <BackendsTable object={object} deps={deps} />
      </Section>
    </div>
  );
});

const GrpcRouteDetails = observer(({ object, deps }: ViewProps) => {
  const route = asGatewayApiObject(object);
  const rules = rulesOf(route);

  useSubscribedStores(deps.subscribeStores, [
    deps.gatewayApi.storeOf("gateways"),
    deps.gatewayApi.storeOf("referencegrants"),
    deps.serviceStore,
  ]);

  return (
    <div className={styles.root}>
      <DrawerItem name="Hostnames">
        <Chips values={hostnamesOf(route)} empty="any" />
      </DrawerItem>
      <Section title="Parents">
        <ParentsTable object={object} deps={deps} />
      </Section>
      <Section title={`Rules (${rules.length})`}>
        {rules.map((rule, index) => (
          <div key={index} className={styles.card}>
            <strong>Rule {index + 1}</strong>
            <div>
              <span className={styles.muted}>Services / methods: </span>
              <Chips values={list(rule.matches).length ? list(rule.matches).map(describeGrpcMatch) : ["*/*"]} />
            </div>
            {list(rule.filters).length > 0 && (
              <div>
                <span className={styles.muted}>Filters: </span>
                <Chips values={list(rule.filters).map(describeFilter)} />
              </div>
            )}
          </div>
        ))}
      </Section>
      <Section title="Backends">
        <BackendsTable object={object} deps={deps} />
      </Section>
    </div>
  );
});

const L4RouteDetails = observer(({ object, deps }: ViewProps) => {
  const route = asGatewayApiObject(object);

  useSubscribedStores(deps.subscribeStores, [
    deps.gatewayApi.storeOf("gateways"),
    deps.gatewayApi.storeOf("referencegrants"),
    deps.serviceStore,
  ]);

  return (
    <div className={styles.root}>
      {object.kind === "TLSRoute" && (
        <DrawerItem name="SNI hostnames">
          <Chips values={hostnamesOf(route)} empty="any" />
        </DrawerItem>
      )}
      <Section title="Parents and listeners">
        <ParentsTable object={object} deps={deps} />
      </Section>
      <Section title="Backends">
        <BackendsTable object={object} deps={deps} />
      </Section>
    </div>
  );
});

const ReferenceGrantDetails = observer(({ object, deps }: ViewProps) => {
  const { from, to } = referenceGrantInfo(asGatewayApiObject(object));
  const routeStores = routeIds.map((id) => deps.gatewayApi.storeOf(id));
  const namespace = object.getNs() ?? "";

  // The references in the cluster this grant permits.
  const enabled = routeStores.flatMap(items).flatMap((route) =>
    backendRefsOf(asGatewayApiObject(route))
      .filter((ref) => ref.namespace === namespace && route.getNs() !== namespace)
      .filter((ref) =>
        isReferenceGranted([asGatewayApiObject(object)], {
          fromGroup: groupOf(route.apiVersion),
          fromKind: route.kind,
          fromNamespace: route.getNs() ?? "",
          toGroup: ref.group,
          toKind: ref.kind,
          toName: ref.name,
          toNamespace: ref.namespace,
        }),
      )
      .map((ref) => ({ route, ref })),
  );

  useSubscribedStores(deps.subscribeStores, routeStores);

  return (
    <div className={styles.root}>
      <Section title="Permission">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">From (namespace · kind)</th>
              <th scope="col" aria-label="grants" />
              <th scope="col">To (in {namespace})</th>
            </tr>
          </thead>
          <tbody>
            {from.map((entry, index) => (
              <tr key={index}>
                <td>
                  <strong>{entry.namespace}</strong> · {entry.kind}
                  {entry.group ? <span className={styles.muted}>.{entry.group}</span> : null}
                </td>
                <td aria-hidden>→</td>
                <td>
                  {to.map((target, targetIndex) => (
                    <div key={targetIndex}>
                      {target.kind}
                      {target.group ? <span className={styles.muted}>.{target.group}</span> : null}{" "}
                      {target.name ? <strong>{target.name}</strong> : <span className={styles.muted}>(any name)</span>}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {to.some((target) => !target.name) && (
          <div className={styles.notice}>
            This grant covers every{" "}
            {to
              .filter((t) => !t.name)
              .map((t) => t.kind)
              .join(", ")}{" "}
            in {namespace}. Name a target to narrow it.
          </div>
        )}
      </Section>
      <Section title={`References it permits (${enabled.length})`}>
        {enabled.length === 0 ? (
          <div className={styles.muted}>No route currently uses this grant.</div>
        ) : (
          enabled.map(({ route, ref }, index) => (
            <div key={index}>
              <LinkButton onClick={() => deps.showDetails(route.selfLink)}>
                {route.kind} {route.getNs()}/{route.getName()}
              </LinkButton>{" "}
              → {ref.kind} {ref.name}
            </div>
          ))
        )}
      </Section>
    </div>
  );
});

const BackendTlsPolicyDetails = observer(({ object, deps }: ViewProps) => {
  const info = backendTlsPolicyInfo(asGatewayApiObject(object));

  useSubscribedStores(deps.subscribeStores, [deps.serviceStore]);

  return (
    <div className={styles.root}>
      <DrawerItem name="Targets">
        {info.targetRefs.map((ref, index) => {
          const service = ref.kind === "Service" ? deps.serviceStore.getByName(ref.name, ref.namespace) : undefined;

          return (
            <div key={index}>
              <LinkButton onClick={service ? () => deps.showDetails(service.selfLink) : undefined}>
                {ref.kind} {ref.name}
                {ref.sectionName ? `:${ref.sectionName}` : ""}
              </LinkButton>
              {ref.kind === "Service" && deps.serviceStore.isLoaded && !service && (
                <span className={cssNames(styles.critical)}> (not found)</span>
              )}
            </div>
          );
        })}
      </DrawerItem>
      <DrawerItem name="Hostname (SNI)">{info.hostname ?? "—"}</DrawerItem>
      <DrawerItem name="Certificate validation">
        {info.wellKnownCACertificates
          ? `Well-known CAs: ${info.wellKnownCACertificates}`
          : info.caCertificateRefs.length
            ? info.caCertificateRefs.map((ref) => `${ref.kind} ${ref.name}`).join(", ")
            : "—"}
      </DrawerItem>
      {info.subjectAltNames.length > 0 && (
        <DrawerItem name="Subject alt names">
          <Chips values={info.subjectAltNames} />
        </DrawerItem>
      )}
      <Section title="Policy status">
        {info.ancestors.length === 0 ? (
          <div className={styles.muted}>No Gateway has reported this policy yet.</div>
        ) : (
          info.ancestors.map((ancestor, index) => (
            <div key={index} className={styles.card}>
              <div className={styles.cardHeader}>
                <span>
                  {ancestor.ancestorRef.kind} {ancestor.ancestorRef.namespace}/{ancestor.ancestorRef.name}
                </span>
                <span className={styles.muted}>{ancestor.controllerName}</span>
              </div>
              <ConditionsTable conditions={ancestor.conditions} />
            </div>
          ))
        )}
      </Section>
    </div>
  );
});

const ListenerSetDetails = observer(({ object, deps }: ViewProps) => {
  const set = asGatewayApiObject(object);
  const info = listenerSetInfo(set);
  const gatewaysStore = deps.gatewayApi.storeOf("gateways");
  const [editing, setEditing] = useState(false);
  const allowed = useEditPermission(deps, object, deps.gatewayApi.status("listenersets")?.plural ?? "listenersets");
  const listeners = useMemo(() => info.listeners, [JSON.stringify(set.spec)]);

  useSubscribedStores(deps.subscribeStores, [gatewaysStore]);

  return (
    <div className={styles.root}>
      <DrawerItem name="Parent Gateway">
        <LinkButton onClick={linkTo(deps, gatewaysStore, info.parentRef.name, info.parentRef.namespace)}>
          {info.parentRef.namespace}/{info.parentRef.name}
        </LinkButton>
      </DrawerItem>
      <Section title="Status">
        <ConditionsTable conditions={info.conditions} />
      </Section>
      <Section
        title={`Listeners (${info.listeners.length})`}
        actions={<EditToggle editing={editing} setEditing={setEditing} label="Edit listeners" />}
      >
        {editing ? (
          <ListenerEditor
            objectName={object.getName()}
            listeners={listeners}
            allowed={allowed}
            protectedTarget={deps.isProtected(object)}
            onApply={(next) =>
              deps.patchSpec(
                deps.gatewayApi.storeOf("listenersets"),
                object,
                { listeners: next.map(fromListener) },
                "Replace the listeners",
              )
            }
          />
        ) : (
          <ListenersTable listeners={info.listeners} object={set} />
        )}
      </Section>
      <AttachedRoutes object={object} deps={deps} kindOf="ListenerSet" />
    </div>
  );
});

const viewsById: Record<GatewayApiResourceId, React.ComponentType<ViewProps>> = {
  gatewayclasses: GatewayClassDetails,
  gateways: GatewayDetails,
  httproutes: HttpRouteDetails,
  grpcroutes: GrpcRouteDetails,
  tcproutes: L4RouteDetails,
  tlsroutes: L4RouteDetails,
  udproutes: L4RouteDetails,
  referencegrants: ReferenceGrantDetails,
  backendtlspolicies: BackendTlsPolicyDetails,
  listenersets: ListenerSetDetails,
};

interface Dependencies {
  deps: GatewayApiViewDependencies;
}

const NonInjectedGatewayApiDetails = observer(({ object, deps }: { object: KubeObject } & Dependencies) => {
  const definition = getGatewayApiKindOf(object?.apiVersion, object?.kind);

  if (!definition) return null;

  const View = viewsById[definition.id];

  return (
    <div data-testid={`gateway-api-details-${definition.id}`}>
      <View object={object} deps={deps} />
    </div>
  );
});

export const GatewayApiDetails = withInjectables<Dependencies, { object: KubeObject }>(NonInjectedGatewayApiDetails, {
  getProps: (di, props) => ({ ...props, deps: di.inject(gatewayApiViewDependenciesInjectable) }),
});
