# Homelab Visualizer Design

## Summary

Build a small, local, read-only browser application that turns one or more
YAML files into one unified, top-down visual map of a single homelab. The map
distinguishes hardware, network, compute, and application layers. The YAML
configuration is the sole source of truth.
The application does not discover infrastructure or poll live status, but
entities can link to external dashboards and service interfaces.

The proof of concept (PoC) prioritizes an understandable configuration format,
strict feedback for LLM-generated YAML, useful automatic diagrams, and easy
navigation between layers. It deliberately avoids editing, monitoring,
deployment packaging, visual polish, and test coverage until the workflow is
proven.

## Goals

- Describe a practical homelab overview from physical hardware through hosted
  applications.
- Split configuration across files from one explicit root YAML file.
- Validate all input strictly and report actionable, source-aware errors.
- Show the complete infrastructure in one explorable, top-down hierarchy with
  clearly labelled hardware, network, compute, and application layers.
- Compute layouts automatically; configuration never contains coordinates.
- Make upstream and downstream relationships inspectable and navigable across
  views.
- Support safe links to externally hosted dashboards and services.
- Reload automatically while YAML files are edited outside the application.
- Prove the complete workflow with a bundled, realistic example.

## Non-goals

- Editing or saving YAML in the browser
- Manual node positioning or persisted layout hints
- Infrastructure discovery, health checks, metrics, or live status
- Authentication, authorization, secrets, or credential management
- Multiple sites in one configuration
- Exhaustive inventory, firewall-rule, storage-volume, PCI device, or cable
  modelling
- Mobile-first or visually polished presentation
- Themes, animations, or light/dark colour-scheme handling
- Image or PDF export
- Docker packaging or an installable CLI in the PoC
- Automated tests or coverage requirements in the PoC

Docker is the expected distribution direction after the PoC, but it imposes no
requirements on the initial implementation beyond keeping configuration access
behind the server boundary.

## Launch and operating model

The application runs locally from a repository checkout. The primary
development command accepts the root configuration path:

```sh
bun run dev -- path/to/homelab.yaml
```

The Bun server binds to `127.0.0.1` by default. It owns filesystem access,
parsing, validation, normalization, and file watching. The browser is a
read-only client and never receives permission to read arbitrary local files.

During development, Vite serves the client and proxies API and reload traffic
to the Bun server. A production build produces static client assets that the
Bun server can serve alongside the same API:

```sh
bun run build
bun run start -- path/to/homelab.yaml
```

Supporting a configurable host or port is acceptable, but is not required for
PoC acceptance.

## Architecture

The project is a single TypeScript package with three clear internal areas:

- `domain`: schemas, YAML loading, semantic validation, normalized entities,
  relationship derivation, and view-independent types
- `server`: command arguments, local file access, file watching, API responses,
  reload events, and production asset serving
- `client`: application shell, unified layer adapter, layouts, graph rendering,
  search, selection, diagnostics, and the details panel

The boundaries are:

```text
root YAML and imports
        |
        v
parse -> structural validation -> merge -> semantic validation
        |                                  |
        +----------- diagnostics ----------+
                                           |
                                           v
                                 normalized domain model
                                           |
                 +------------+------------+------------+
                 v            v            v            v
              hardware     network      compute    applications
               adapter      adapter       adapter       adapter
                 |            |            |            |
                 +------ ELK automatic layout ----------+
                                           |
                                           v
                                  React Flow canvases
```

The server publishes only a validated, normalized model. The client adapter
must not parse YAML or repair invalid domain data. It converts the shared model
into nodes, edges, layer groups, labels, and top-down ELK configuration for one
React Flow canvas.

## Configuration files and imports

The root document contains:

- `version`: required schema version; the PoC accepts the integer `1`
- `site`: required metadata containing an ID, name, and optional description
- `imports`: optional ordered list of relative YAML file paths
- any of the supported collections: `hardwareGroups`, `devices`, `networks`,
  `interfaces`, `networkLinks`, `compute`, and `applications`

Imported documents may contain further imports and any supported entity
collections, but cannot redefine `version` or `site`. Imports resolve relative
to the file containing the import. Only `.yaml` and `.yml` files are accepted.
Resolved files must remain within the directory containing the root file;
absolute paths and paths that escape that directory are rejected.

Imports are traversed in declaration order. Importing the same resolved file
more than once is an error rather than an implicit merge. Import cycles are an
error. No file or entity overrides another: duplicate entity IDs always fail
validation.

One file may contain the whole configuration. Splitting by layer is the
recommended convention, not a structural requirement:

```yaml
version: 1
site:
  id: home
  name: Home Lab
imports:
  - hardware.yaml
  - network.yaml
  - compute.yaml
  - applications.yaml
```

All documents reject unknown top-level keys and unknown entity fields. YAML
anchors and aliases are accepted and resolved before validation with the YAML
parser's alias-expansion safeguards enabled. The bundled example does not rely
on them.

## Common entity contract

Every entity has a globally unique, stable `id`. IDs use lowercase ASCII
letters, numbers, and hyphens, start with a letter, and are the only mechanism
for cross-references. Names are display text and can change without breaking
references.

The site ID follows the same syntax but is metadata rather than a referencable
entity and does not participate in the entity registry.

All entity types share:

- `id`: required stable identifier
- `name`: required display name
- `description`: optional short text
- `tags`: optional list of strings
- `notes`: optional longer plain text
- `links`: optional list of labelled HTTP or HTTPS URLs

Links cannot use script, file, data, or other URL schemes. The browser opens
external links in a new tab with opener access disabled.

The schema must not define fields for credentials, tokens, private keys, or
other secrets. Documentation and the example explicitly warn users not to put
secrets in configuration because the normalized model is sent to the browser.

## Layer entities

### Hardware

`hardwareGroups` describe optional physical containment. A group has a `kind`
of `room`, `rack`, `shelf`, or `other`, and may reference a parent group.
Containment cycles are invalid.

`devices` represent physical equipment. A device has:

- `kind`: `server`, `switch`, `router`, `gateway`, `storage`, `ups`, or `other`
- `group`: optional hardware group reference
- `manufacturer` and `model`: optional strings
- `specs`: optional string-to-string map for concise facts that do not warrant
  first-class modelling
- the common entity fields

The flexible `specs` map is for display only and cannot create relationships.

### Network

`networks` represent a logical network, VLAN, or WAN segment. A network has:

- `kind`: `lan`, `vlan`, `wan`, or `other`
- `cidr`: optional CIDR notation
- `vlan`: integer from 1 through 4094, required when `kind` is `vlan` and
  otherwise omitted
- the common entity fields

`interfaces` represent network attachment points. An interface has:

- `owner`: required reference to a device or compute entity
- `network`: optional network reference
- `addresses`: optional list of IP addresses
- `mac`: optional MAC address
- the common entity fields

`networkLinks` declare peer connections using required `from` and `to`
interface IDs plus an optional display `label`. They are undirected physical or
logical adjacency, not entities or dependency direction. The same unordered
pair cannot be declared twice, and an interface cannot link to itself.

The PoC validates the syntax of CIDRs, IP addresses, VLAN identifiers, and MAC
addresses. It does not attempt address-allocation, subnet-membership, routing,
or VLAN consistency analysis.

### Compute

`compute` entities have a `kind` of `host`, `vm`, or `container`.

- A `host` must reference its backing physical `device`.
- A `vm` or `container` must reference a parent compute entity through
  `runsOn`.
- A parent must ultimately resolve to a `host`; placement cycles are invalid.
- A `vm` can run on a host.
- A `container` can run on a host or VM.

Optional `resources` contain `cpu`, `memory`, and `storage` string fields, such
as `4 cores`, `8 GiB`, and `100 GiB`. These values are displayed but the PoC
does not perform capacity calculations. Network interfaces can use compute
entities as their owner.

### Applications

`applications` represent deployed services. An application has:

- `runsOn`: required compute entity reference
- `dependsOn`: optional list of application IDs
- `endpoints`: optional list of labelled HTTP or HTTPS URLs
- the common entity fields

An application dependency means the source application relies on the target.
Self-dependencies are invalid. Cyclic dependencies between distinct
applications are allowed and remain understandable because relationship
direction is defined per edge. Endpoints and common links are both displayed;
endpoints are service access points, while links are supporting pages such as
documentation or dashboards.

## Relationships

All relationships are normalized into typed edges with source, target, type,
label, direction, and whether the edge was declared or derived.

Directed edges point from the dependent entity to the entity it relies on.
For a selected entity:

- **Upstream** contains the targets it relies on.
- **Downstream** contains entities that rely on it.
- **Connections** contains undirected peers such as network links.

Declared relationships include application dependencies and network peer
links. Derived relationships include:

- hardware item to containing hardware group
- compute host to backing physical device
- VM or container to its compute parent
- application to its deployment target
- interface to its owner and network

The application derives only direct edges. The details panel may group direct
relationships by type, but does not need to calculate or display the full
transitive dependency tree.

## Browser experience

The shared shell contains global search, one unified canvas, a details panel,
and a compact validation/reload status area:

```text
+ Homelab map ----------------------------------------- Search +
|                                                        |       |
|                    visual canvas                       | info  |
|                                                        |       |
+ reload and validation status ---------------------------------+
```

The canvas supports pan, zoom, fit-to-screen, automatic layout, entity
selection, focusing a selected entity, and transient node dragging. Dragged
positions exist only in browser memory and are never written to YAML or
persisted. Four lightly shaded horizontal bands, in order from top to bottom,
identify Hardware, Network, Compute, and Applications. Node labels and shapes
identify entity type without relying on colour alone.

Show only primary placement and dependency relationships by default. A solid
arrow has one consistent direction: from an entity to what it relies on. A
dashed, unarrowed line is an undirected network peer link. Secondary derived
relationships appear only when relevant to a selected node. Selecting a node
highlights its direct upstream and downstream relationships and dims unrelated
nodes and edges.

Search matches IDs, names, and tags across the complete model. Selecting a
result focuses it in the unified map and opens its details.

The details panel shows the entity's common fields, type-specific fields,
external links, upstream entities, downstream entities, and peer connections.
Selecting a related entity focuses it in the unified map. The selection
survives a successful reload if the selected ID still exists; otherwise it is
cleared.

The interface uses only basic CSS needed for readable cards, spacing, the
details panel, controls, focus indicators, and obvious error states. It has one
fixed colour scheme, no animation, no theme system, and no visual-polish goal.
Controls must be keyboard reachable and labelled, and relationship meaning must
not rely on colour alone. Narrow screens only need to avoid broken or
inaccessible controls; mobile optimization is excluded.

## Loading, reload, and diagnostics

Loading is atomic:

1. Resolve the root and all imports.
2. Parse every YAML document while retaining source locations.
3. Validate document structure.
4. Merge all entities into one global registry.
5. Validate IDs, references, value formats, relationship constraints, and
   prohibited containment or placement cycles.
6. Derive normalized relationships.
7. Publish the complete model to the client.

Every loaded file is watched. Watch events are debounced so one editor save
causes one reload attempt. A successful reload replaces the model and notifies
the browser. A failed reload publishes diagnostics but retains the last valid
model. If no valid model has ever loaded, the browser shows a full error state
instead of an empty diagram.

Diagnostics have a category, message, source file, YAML path, and line and
column where available. Categories distinguish:

- filesystem and import failures
- YAML syntax failures
- structural schema failures
- duplicate IDs
- invalid or missing references
- invalid scalar formats
- prohibited import, containment, or compute-placement cycles

Diagnostics should identify the invalid value and expected constraint. Raw
stack traces never appear in the browser. Unexpected server errors are logged
with technical detail and exposed as a concise generic diagnostic.

The server exposes a small read-only API for the active model and diagnostics,
plus a server-sent event stream for successful reloads and validation failures.
SSE is sufficient because all updates are server-to-browser and avoids a
WebSocket dependency.

## Technology

Use stable package releases current when implementation begins and commit the
resolved versions in `bun.lock`. Do not use prereleases merely because they are
newer. Manage Bun with mise's default `bun@latest` selection. At the time of
this design, the relevant current lines are React 19.2, Vite 8.2, TypeScript 7,
and Vitest 5.

Core choices are:

- Bun for runtime, package management, scripts, HTTP serving, and file watching
- React and Vite for the browser client
- `@xyflow/react` for canvas interaction and rendering
- `elkjs` for automatic hierarchical layout
- Zod 4 as the single structural schema source, with inferred TypeScript types
  and generated JSON Schema
- `yaml` for parsing documents and mapping diagnostics back to source locations
- plain CSS without a component or styling framework
- Vitest as the designated future test runner

The client should use simple tab state or URL fragments rather than add a
routing dependency solely for four views.

## Repository conventions

The project follows the relevant conventions from the sibling `../fold`
repository:

- ESM package (`"type": "module"`)
- `@tsconfig/strictest` with bundler module resolution and no emitted TypeScript
- explicit Bun types for server code and Vite/DOM types for client code
- `lint`: `oxlint --type-aware --no-error-on-unmatched-pattern`
- Oxlint `correctness` and `suspicious` categories as errors
- Oxlint `perf` category as warnings
- Oxlint ignores `dist` and `node_modules`
- `fmt`: `oxfmt`
- `fmt:check`: `oxfmt --check`
- Oxfmt print width 80, no semicolons, single quotes, and trailing commas
- root `typecheck` and `build` scripts

Latest compatible Oxlint, Oxfmt, TypeScript, and tsconfig packages should be
installed when scaffolding. The configuration rules above are copied from
`../fold`; its dependency ranges are not treated as permanent pins.

## JSON Schema and authoring documentation

The implementation generates a JSON Schema from the same Zod definitions used
at runtime, preventing validation and authoring contracts from drifting. The
generated schema is committed as `schema/homelab.schema.json`, produced
deterministically by a `schema:generate` repository script, and referenced from
the YAML authoring guide.

Documentation includes:

- the minimal root file
- the complete entity and relationship reference
- ID and reference rules
- import resolution and confinement rules
- upstream/downstream direction semantics
- validation command or normal launch feedback
- a prominent warning against secrets
- a concise prompt/example suitable for asking an LLM to generate configuration

## Bundled example

The repository includes a split-file example rooted at
`examples/homelab.yaml`. It contains enough linked data to exercise every view
and entity type:

- one room or rack grouping
- a gateway and managed switch
- at least two physical servers
- attached storage and a UPS
- a LAN and at least one VLAN with representative addresses
- interfaces and network peer links
- compute hosts, at least one VM, and multiple containers
- several applications across more than one compute target
- application dependencies, endpoints, and dashboard links

Example URLs use reserved or clearly fictional hosts and contain no secrets.

## Verification policy

The PoC intentionally proves the workflow before test coverage is added.
Vitest is installed and configured as the future test runner, but the initial
implementation contains no test files and sets no coverage threshold.

Required automated verification for the PoC is:

- `bun run fmt:check`
- `bun run lint`
- `bun run typecheck`
- `bun run build`

Manual acceptance uses the bundled example and verifies:

1. A fresh install launches from the root YAML path.
2. All imported files load into one model.
3. Hardware, network, compute, and applications render with useful automatic
   layouts.
4. Search finds and focuses entities from every layer.
5. Details show metadata, safe links, and correctly directed relationships.
6. Following a relationship switches view and focuses the destination.
7. Editing a valid file reloads without restarting the process.
8. An invalid edit reports its source and path while preserving the previous
   visualization.
9. Restoring valid YAML clears the diagnostics and updates the visualization.

After the PoC is accepted, a separate testing phase should cover YAML parsing
and imports, structural and semantic validation, relationship derivation, view
adapters, and critical client navigation interactions. That work is not part of
the PoC implementation plan.

## PoC acceptance criteria

The PoC is accepted when all required automated verification commands pass and
the bundled example satisfies every manual acceptance step. It must demonstrate
the complete YAML-to-browser workflow; visual refinement, Docker distribution,
and automated test coverage do not block acceptance.
