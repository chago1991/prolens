/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { GatewayApiResourceId } from "./kinds";

export interface TemplateTarget {
  readonly id: GatewayApiResourceId;
  /** `group/version` as discovery serves it. */
  readonly apiVersion: string;
  readonly kind: string;
  readonly namespace?: string;
  /** A GatewayClass to reference, when the cluster has one. */
  readonly gatewayClassName?: string;
  /** A Gateway to attach a route to, when the cluster has one. */
  readonly gatewayName?: string;
}

const metadata = (name: string, namespace: string | undefined) =>
  namespace ? `metadata:\n  name: ${name}\n  namespace: ${namespace}` : `metadata:\n  name: ${name}`;

const parentRefs = (gateway: string) => `  parentRefs:\n    - name: ${gateway}`;

/**
 * A starting point for a new resource, in the version the cluster serves.
 * The create-resource editor shows it, so the user reviews it before it is
 * applied.
 */
export const renderTemplate = (target: TemplateTarget): string => {
  const header = `apiVersion: ${target.apiVersion}\nkind: ${target.kind}`;
  const ns = target.namespace ?? "default";
  const gateway = target.gatewayName ?? "example-gateway";

  switch (target.id) {
    case "gatewayclasses":
      return `${header}\n${metadata("example-class", undefined)}\nspec:\n  controllerName: example.com/gateway-controller\n  description: Example gateway class\n`;
    case "gateways":
      return `${header}\n${metadata("example-gateway", ns)}\nspec:\n  gatewayClassName: ${target.gatewayClassName ?? "example-class"}\n  listeners:\n    - name: http\n      protocol: HTTP\n      port: 80\n      allowedRoutes:\n        namespaces:\n          from: Same\n`;
    case "httproutes":
      return `${header}\n${metadata("example-route", ns)}\nspec:\n${parentRefs(gateway)}\n  hostnames:\n    - example.com\n  rules:\n    - matches:\n        - path:\n            type: PathPrefix\n            value: /\n      backendRefs:\n        - name: example-service\n          port: 80\n`;
    case "grpcroutes":
      return `${header}\n${metadata("example-grpc-route", ns)}\nspec:\n${parentRefs(gateway)}\n  rules:\n    - matches:\n        - method:\n            service: example.v1.ExampleService\n      backendRefs:\n        - name: example-grpc-service\n          port: 50051\n`;
    case "tcproutes":
    case "udproutes":
      return `${header}\n${metadata(`example-${target.id === "tcproutes" ? "tcp" : "udp"}-route`, ns)}\nspec:\n  parentRefs:\n    - name: ${gateway}\n      sectionName: ${target.id === "tcproutes" ? "tcp" : "udp"}\n  rules:\n    - backendRefs:\n        - name: example-service\n          port: ${target.id === "tcproutes" ? 9000 : 5353}\n`;
    case "tlsroutes":
      return `${header}\n${metadata("example-tls-route", ns)}\nspec:\n  parentRefs:\n    - name: ${gateway}\n      sectionName: tls\n  hostnames:\n    - example.com\n  rules:\n    - backendRefs:\n        - name: example-service\n          port: 443\n`;
    case "referencegrants":
      return `${header}\n${metadata("allow-routes-from-other-namespace", ns)}\nspec:\n  from:\n    - group: gateway.networking.k8s.io\n      kind: HTTPRoute\n      namespace: other-namespace\n  to:\n    - group: ""\n      kind: Service\n`;
    case "backendtlspolicies":
      return `${header}\n${metadata("example-backend-tls", ns)}\nspec:\n  targetRefs:\n    - group: ""\n      kind: Service\n      name: example-service\n  validation:\n    hostname: example-service.${ns}.svc\n    caCertificateRefs:\n      - group: ""\n        kind: ConfigMap\n        name: example-ca\n`;
    case "listenersets":
      return `${header}\n${metadata("example-listeners", ns)}\nspec:\n  parentRef:\n    name: ${gateway}\n  listeners:\n    - name: extra-http\n      protocol: HTTP\n      port: 8080\n`;
  }
};
