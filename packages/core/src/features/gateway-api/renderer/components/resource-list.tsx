/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { withInjectables } from "@ogre-tools/injectable-react";
import { computed } from "mobx";
import { observer } from "mobx-react";
import { KubeObjectAge } from "../../../../renderer/components/kube-object/age";
import { KubeObjectListLayout } from "../../../../renderer/components/kube-object-list-layout";
import { SiblingsInTabLayout } from "../../../../renderer/components/layout/siblings-in-tab-layout";
import { NamespaceSelectBadge } from "../../../../renderer/components/namespaces/namespace-select-badge";
import { WithTooltip } from "../../../../renderer/components/with-tooltip";
import routePathParametersInjectable from "../../../../renderer/routes/route-path-parameters.injectable";
import { getGatewayApiKind } from "../../common/kinds";
import {
  attachedRoutesOf,
  backendRefsOf,
  backendTlsPolicyInfo,
  conditionsOf,
  describeParents,
  gatewayClassInfo,
  gatewayInfo,
  healthOfConditions,
  hostnamesOf,
  listenerSetInfo,
  referenceGrantInfo,
  routeStateFor,
  routeStateHealth,
  rulesOf,
} from "../../common/model";
import { gatewayApiResourcesRouteInjectable } from "../../common/routes.injectable";
import { renderTemplate } from "../../common/templates";
import { useCanI } from "../can-i.injectable";
import gatewayApiViewDependenciesInjectable, { asGatewayApiObject } from "../view-dependencies.injectable";
import styles from "./gateway-api.module.scss";
import { GatewayApiUnavailable } from "./overview";
import { HealthBadge } from "./shared";

import type { KubeObject } from "@freelensapp/kube-object";

import type { IComputedValue } from "mobx";

import type { GatewayApiKindDefinition, GatewayApiResourceId } from "../../common/kinds";
import type { Health } from "../../common/model";
import type { GatewayApiViewDependencies } from "../view-dependencies.injectable";

interface Column {
  readonly id: string;
  readonly title: string;
  readonly value: (object: KubeObject) => string | number;
  readonly render?: (object: KubeObject) => React.ReactNode;
}

const healthOrder: Health[] = ["critical", "missing", "warning", "unknown", "healthy"];

export const healthOf = (id: GatewayApiResourceId, object: KubeObject): Health => {
  const value = asGatewayApiObject(object);

  switch (id) {
    case "gatewayclasses":
    case "gateways":
    case "listenersets":
      return healthOfConditions(conditionsOf(value), object.metadata.generation);
    case "httproutes":
    case "grpcroutes":
    case "tcproutes":
    case "tlsroutes":
    case "udproutes":
      return routeStateHealth[routeStateFor(value)];
    case "backendtlspolicies":
      return healthOfConditions(backendTlsPolicyInfo(value).ancestors.flatMap((ancestor) => ancestor.conditions));
    case "referencegrants":
      return "healthy";
  }
};

const statusLabel = (id: GatewayApiResourceId, object: KubeObject) => {
  if (id === "referencegrants") return "—";

  const value = asGatewayApiObject(object);

  if (id.endsWith("routes")) return routeStateFor(value);

  return healthOf(id, object);
};

const text = (values: readonly string[]) => values.join(", ");

const columnsFor = (id: GatewayApiResourceId): Column[] => {
  const g = (object: KubeObject) => asGatewayApiObject(object);

  switch (id) {
    case "gatewayclasses":
      return [
        { id: "controller", title: "Controller", value: (o) => gatewayClassInfo(g(o)).controllerName ?? "" },
        { id: "description", title: "Description", value: (o) => gatewayClassInfo(g(o)).description ?? "" },
      ];
    case "gateways":
      return [
        { id: "class", title: "Class", value: (o) => gatewayInfo(g(o)).className ?? "" },
        { id: "addresses", title: "Addresses", value: (o) => text(gatewayInfo(g(o)).addresses) },
        {
          id: "listeners",
          title: "Listeners",
          value: (o) => text(gatewayInfo(g(o)).listeners.map((l) => `${l.name} ${l.protocol}:${l.port}`)),
        },
        { id: "routes", title: "Routes", value: (o) => attachedRoutesOf(g(o)) },
      ];
    case "httproutes":
    case "grpcroutes":
    case "tlsroutes":
      return [
        { id: "hostnames", title: id === "tlsroutes" ? "SNI" : "Hostnames", value: (o) => text(hostnamesOf(g(o))) },
        { id: "parents", title: "Parents", value: (o) => describeParents(g(o)) },
        { id: "rules", title: "Rules", value: (o) => rulesOf(g(o)).length },
        {
          id: "backends",
          title: "Backends",
          value: (o) =>
            text([...new Set(backendRefsOf(g(o)).map((ref) => `${ref.name}${ref.port ? `:${ref.port}` : ""}`))]),
        },
      ];
    case "tcproutes":
    case "udproutes":
      return [
        { id: "parents", title: "Parents", value: (o) => describeParents(g(o)) },
        {
          id: "backends",
          title: "Backends",
          value: (o) => text(backendRefsOf(g(o)).map((ref) => `${ref.name}${ref.port ? `:${ref.port}` : ""}`)),
        },
      ];
    case "referencegrants":
      return [
        {
          id: "from",
          title: "From",
          value: (o) => text(referenceGrantInfo(g(o)).from.map((entry) => `${entry.namespace}/${entry.kind}`)),
        },
        {
          id: "to",
          title: "To",
          value: (o) =>
            text(referenceGrantInfo(g(o)).to.map((entry) => `${entry.kind}${entry.name ? `/${entry.name}` : ""}`)),
        },
      ];
    case "backendtlspolicies":
      return [
        {
          id: "targets",
          title: "Targets",
          value: (o) => text(backendTlsPolicyInfo(g(o)).targetRefs.map((ref) => `${ref.kind}/${ref.name}`)),
        },
        { id: "hostname", title: "Hostname", value: (o) => backendTlsPolicyInfo(g(o)).hostname ?? "" },
      ];
    case "listenersets":
      return [
        {
          id: "parent",
          title: "Gateway",
          value: (o) => {
            const parent = listenerSetInfo(g(o)).parentRef;

            return `${parent.namespace}/${parent.name}`;
          },
        },
        { id: "listeners", title: "Listeners", value: (o) => listenerSetInfo(g(o)).listeners.length },
      ];
  }
};

interface Dependencies {
  resource: IComputedValue<string | undefined>;
  deps: GatewayApiViewDependencies;
}

const CreateButtonGate = ({
  deps,
  definition,
  children,
}: {
  deps: GatewayApiViewDependencies;
  definition: GatewayApiKindDefinition;
  children: (canCreate: boolean | undefined) => React.ReactElement;
}) => {
  const status = deps.gatewayApi.status(definition.id);
  const namespace = definition.namespaced ? deps.context.contextNamespaces[0] : undefined;
  const allowed = useCanI(
    deps.canI,
    status?.group && status.plural
      ? { verb: "create", group: status.group, resource: status.plural, namespace }
      : undefined,
  );

  return children(allowed);
};

const NonInjectedGatewayApiResources = observer(({ resource, deps }: Dependencies) => {
  const definition = getGatewayApiKind(resource.get() ?? "");

  if (!definition) {
    return (
      <SiblingsInTabLayout>
        <div className={styles.page}>Unknown Gateway API resource.</div>
      </SiblingsInTabLayout>
    );
  }

  const status = deps.gatewayApi.status(definition.id);
  const store = deps.gatewayApi.storeOf(definition.id);

  if (!status || status.state !== "supported" || !store) {
    return (
      <SiblingsInTabLayout>
        <GatewayApiUnavailable definition={definition} status={status} deps={deps} />
      </SiblingsInTabLayout>
    );
  }

  const columns = columnsFor(definition.id);
  const kind = status.kind ?? definition.kind;

  const openCreate = () => {
    const gateways = deps.gatewayApi.storeOf("gateways")?.items ?? [];
    const classes = deps.gatewayApi.storeOf("gatewayclasses")?.items ?? [];

    deps.openCreate(
      renderTemplate({
        id: definition.id,
        apiVersion: `${status.group}/${status.version}`,
        kind,
        namespace: definition.namespaced ? (deps.context.contextNamespaces[0] ?? "default") : undefined,
        gatewayClassName: classes[0]?.getName(),
        gatewayName: gateways[0]?.getName(),
      }),
    );
  };

  return (
    <SiblingsInTabLayout>
      <CreateButtonGate deps={deps} definition={definition}>
        {(canCreate) => (
          <KubeObjectListLayout
            isConfigurable
            key={definition.id}
            tableId={`gateway_api_${definition.id}`}
            className={`GatewayApi GatewayApi-${definition.id}`}
            store={store as any}
            sortingCallbacks={{
              name: (object: KubeObject) => object.getName(),
              namespace: (object: KubeObject) => object.getNs() ?? "",
              status: (object: KubeObject) => healthOrder.indexOf(healthOf(definition.id, object)),
              age: (object: KubeObject) => -object.getCreationTimestamp(),
              ...Object.fromEntries(columns.map((column) => [column.id, column.value])),
            }}
            searchFilters={[
              (object: KubeObject) => object.getSearchFields(),
              ...columns.map((column) => (object: KubeObject) => String(column.value(object))),
              (object: KubeObject) => statusLabel(definition.id, object),
            ]}
            renderHeaderTitle={
              <>
                {definition.title}{" "}
                <span className={styles.chip} title="Served API version">
                  {status.group}/{status.version}
                </span>
                {status.channel && <span className={styles.chip}>{status.channel}</span>}
              </>
            }
            customizeHeader={({ searchProps, ...rest }) => ({
              searchProps: { ...searchProps, placeholder: `Search ${definition.title}...` },
              ...rest,
            })}
            addRemoveButtons={
              canCreate === false
                ? undefined
                : {
                    onAdd: openCreate,
                    addTooltip: `Create ${kind}`,
                  }
            }
            renderTableHeader={[
              { title: "Name", className: "name", sortBy: "name", id: "name" },
              definition.namespaced
                ? { title: "Namespace", className: "namespace", sortBy: "namespace", id: "namespace" }
                : undefined,
              ...columns.map((column) => ({
                title: column.title,
                className: column.id,
                sortBy: column.id,
                id: column.id,
              })),
              { title: "Status", className: "status", sortBy: "status", id: "status" },
              { title: "Age", className: "age", sortBy: "age", id: "age" },
            ]}
            renderTableContents={(object: KubeObject) => [
              <WithTooltip key="name">{object.getName()}</WithTooltip>,
              definition.namespaced && <NamespaceSelectBadge key="namespace" namespace={object.getNs() as string} />,
              ...columns.map((column) => <WithTooltip key={column.id}>{String(column.value(object))}</WithTooltip>),
              <HealthBadge
                key="status"
                health={healthOf(definition.id, object)}
                label={String(statusLabel(definition.id, object))}
              />,
              <KubeObjectAge key="age" object={object} />,
            ]}
            failedToLoadMessage={`Failed to load ${definition.title} (${status.group}/${status.version}).`}
          />
        )}
      </CreateButtonGate>
    </SiblingsInTabLayout>
  );
});

export const GatewayApiResources = withInjectables<Dependencies>(NonInjectedGatewayApiResources, {
  getProps: (di) => {
    const route = di.inject(gatewayApiResourcesRouteInjectable);
    const parameters = di.inject(routePathParametersInjectable, route);

    return {
      resource: computed(() => parameters.get().resource),
      deps: di.inject(gatewayApiViewDependenciesInjectable),
    };
  },
});
