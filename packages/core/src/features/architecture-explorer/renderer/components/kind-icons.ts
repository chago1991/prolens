/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const icons: Record<string, string> = {
  Pod: "view_in_ar",
  Deployment: "layers",
  StatefulSet: "view_stream",
  DaemonSet: "hub",
  ReplicaSet: "content_copy",
  ReplicationController: "content_copy",
  Job: "task_alt",
  CronJob: "schedule",
  Node: "dns",
  Service: "lan",
  EndpointSlice: "share",
  Ingress: "login",
  IngressClass: "category",
  Gateway: "router",
  GatewayClass: "category",
  HTTPRoute: "alt_route",
  GRPCRoute: "alt_route",
  TLSRoute: "alt_route",
  TCPRoute: "alt_route",
  UDPRoute: "alt_route",
  ConfigMap: "tune",
  Secret: "key",
  ServiceAccount: "badge",
  PersistentVolumeClaim: "save",
  PersistentVolume: "storage",
  StorageClass: "inventory_2",
  NetworkPolicy: "shield",
  CiliumNetworkPolicy: "shield",
  CiliumClusterwideNetworkPolicy: "shield",
  Group: "folder",
};

export const kindIcon = (kind: string): string => icons[kind] ?? "widgets";
