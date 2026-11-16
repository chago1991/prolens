# Architecture Explorer

The Architecture Explorer draws how a cluster's resources are connected. Its
main job is troubleshooting:

1. Pick a resource that has a problem.
2. See what it depends on.
3. Find where the problem starts.
4. Read the evidence.
5. Open the affected resource.

It is a page of each cluster's view: **Architecture** in the sidebar.

Every resource also has **Explore dependencies** in its context menu. That
opens the dependency view starting from the resource.

## Where the data comes from

The explorer reads the stores that the rest of the cluster view already uses,
and watches them while the page is open.

- **No new access.** It opens no new connection and uses no other
  credentials.
- **One cluster only.** It never sees another cluster.
- **Secret values are never read.** The graph uses only Secret names and
  metadata.
- **Your permissions apply.** A kind you may not list is skipped, and the
  status line names it.
- **The namespace filter applies.** It shows the namespaces that the cluster
  view's namespace filter selects.

Gateway API resources are included when their CRDs are installed, from the
`gateway.networking.k8s.io` group. So are Cilium policies, from the `cilium.io`
group.

A resource owned by an object of a kind ProLens does not load still shows its
owner, as a node marked _not loaded_. An operator's custom resource is an
example.

## How relationships are known

Every relationship carries one of three kinds of provenance.

| Provenance               | Meaning                                            | Examples                                                                                                                                                       |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observed (solid line)    | Recorded by the cluster                            | Owner references; the node a pod runs on; the pods an EndpointSlice lists; the volume a claim is bound to; a route accepted by its gateway                     |
| Referenced (dashed line) | A name written in a spec; the target may not exist | The ConfigMaps, Secrets, ServiceAccount and claims a pod template uses; an Ingress's backend Services and class; a route's parent gateways and backends        |
| Inferred (dotted line)   | Worked out by ProLens                              | A Service selecting a pod that no EndpointSlice lists; the default StorageClass or IngressClass; the `default` ServiceAccount; a network policy selecting pods |

Every relationship also carries its evidence, in words you can check against
the YAML: for example `volume config` or `shop.example/ → web:80`. Click an
edge to read it.

A reference to an object that does not exist is drawn as a **missing** node
with a dashed red outline, and the reference is drawn red. The object that
needs it becomes critical.

A reference is called missing only when its kind and namespace were loaded.
Otherwise the node is _not verified_. An optional reference
(`optional: true`) is never a problem.

ConfigMaps, Secrets and the ServiceAccount are recorded on the topmost
controller with a pod template, such as a Deployment or a CronJob, not on each
of its pods. Per-pod claims are recorded on the pod: those of a StatefulSet's
claim templates, and ephemeral volumes.

## Health

Health comes from each resource's own status:

- **Pods:** phase, scheduling, and container waiting or termination reasons
  such as `CrashLoopBackOff`, `ImagePullBackOff` or `CreateContainerConfigError`.
- **Workloads:** available or ready replicas, and failed conditions.
- **Nodes:** `Ready`, pressure conditions, cordoning.
- **Storage:** the phase of claims and volumes.
- **Gateway API:** the `Accepted`, `Programmed` and `ResolvedRefs` conditions.

A Service is critical when its selector matches no pod, or when none of the
pods it selects is a ready endpoint.

Warning events are attached to the resource they are about, and are counted
on its node.

## Diagnosis

The dependency view starts from a focus resource. It shows what the focus
needs, what would be affected by a change of it, and a diagnosis.

- **What the focus needs.** This follows owners to their children, pods to
  their nodes, claims and policies, Services to their pods, and routes to their
  gateways and backends.
- **Pods include their controller's template.** A pod's dependencies include
  the ConfigMaps and Secrets its controller's template references. They do not
  include the controller's other pods.
- **Root cause.** A _likely root cause_ is a problem none of whose own
  dependencies has a problem. Root causes are listed first, with their
  evidence and their path from the focus.
- **Network policies.** Policies that deny all traffic to a dependency are
  listed separately.
- **Impact.** This is everything that would be affected by a change of the
  focus. It follows the dependencies the other way, plus owners to what they
  own, since a template change reaches the pods.

## Views

| View         | Shows                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| Dependencies | The focus, what it needs and what it affects                                     |
| Cluster      | Every resource of the loaded namespaces, grouped by namespace                    |
| Namespace    | One namespace, with the cluster-scoped resources it uses                         |
| Network      | Ingresses, gateways, routes, Services, EndpointSlices, pods and network policies |
| Routing      | Gateway API and Ingress routing to Services                                      |
| Storage      | Pods, claims, volumes and storage classes, with their workloads                  |
| Scheduling   | Pods by node, with their workloads                                               |

A view that hides the ReplicaSets between Deployments and pods connects them
directly. Such a link says which ReplicaSet it goes through.

## Working with the graph

- **Select:** click a node to inspect it: its health reasons, warning events,
  rules and relationships. From there you can open its details drawer (events,
  YAML, logs) or explore its dependencies.
- **Context menu:** right-click a node for inspect, details, explore
  dependencies, expand or collapse, hide its kind, return to its place, and
  copy its name.
- **Double-click:** on a resource, explores its dependencies. On a group of
  pods or a collapsed group, expands it.
- **Pod groups:** the pods of one workload are drawn as one node with a health
  bar, until you expand it.
- **Group bands:** a namespace or node band can be collapsed into one node
  from its label.
- **Search:** matches names, kinds, statuses and `label=value`. It highlights
  matches and dims the rest. Enter moves to the next match.
- **Problems:** the **Problems** button shows only resources with a problem,
  and what they touch.
- **Filters** choose the kinds a view shows.
- **Layout** sets:
  - the direction: left to right, or top to bottom;
  - what the bands group by: namespace, node, or nothing;
  - the spacing;
  - whether the minimap shows.
- **Dragging:** a dragged node keeps its place in that view. **Reset dragged
  positions** undoes this.
- **Export** writes the current view as SVG or PNG, in the colours of the
  active theme.
- **Keyboard:** `/` searches, `F` fits the graph to the screen, and Escape
  clears the selection.

The layout, filters, positions and focus are remembered per cluster.

## Large clusters

- **Built once per update.** The graph is built in one pass over the stores
  each time they change. Selector matching starts from a label index.
- **Layout without crossings.** The layout places kinds in columns and orders
  each column by the position of its neighbours, so most edges are short and
  uncrossed.
- **Capped node count.** A view shows at most 1,500 nodes at once: the focus,
  search matches and problems first. The status line says when nodes are left
  out.
- **Visible area only.** Only the nodes in view are rendered.

`pnpm bench` includes a benchmark of building, analysing and laying out
generated clusters.

## Not supported

- **Live traffic.** Kubernetes does not record which pod talks to which. Hubble
  flows need Hubble Relay's gRPC API, which the explorer does not use.
  NetworkPolicy and Cilium policy relationships are read from the policies, so
  they show what is allowed, not what happened.
- **Several clusters in one graph.** The explorer shows the cluster of the
  current view.
- **Other custom resources.** Relationships of custom resources other than the
  Gateway API and Cilium policies come only from their owner references.
