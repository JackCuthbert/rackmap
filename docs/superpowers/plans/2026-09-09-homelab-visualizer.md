# Homelab Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, read-only Bun and React application that validates a split YAML homelab configuration and displays its hardware, network, compute, and application layers.

**Architecture:** Keep all filesystem access, YAML parsing, validation, normalization, relationship derivation, and reload watching in a Bun server. The browser consumes only a normalized model and diagnostics through a small HTTP/SSE API; it adapts that shared model into four React Flow/ELK diagrams and provides shared navigation, search, and details interactions. Zod schemas are the single structural contract and generate the committed JSON Schema.

**Tech Stack:** Bun managed by mise's default `bun@latest`, TypeScript 7, React 19, Vite 8, `@xyflow/react`, `elkjs`, Zod 4, `yaml`, plain CSS, Oxlint, Oxfmt, Vitest (configured only).

**Spec:** `docs/superpowers/specs/2026-09-09-homelab-visualizer-design.md`

## Global Constraints

- Use one ESM TypeScript package (`"type": "module"`) with bundler module resolution and no TypeScript emit.
- Use stable releases current at implementation time; manage Bun with mise's default `bun@latest` selection; commit `bun.lock`; do not use prereleases.
- Bind the server to `127.0.0.1` by default; client-side code never reads local files.
- Accept only schema version integer `1`; reject unknown document keys and entity fields.
- Resolve imports only as relative `.yaml`/`.yml` files confined to the root configuration directory; reject duplicates and cycles.
- Publish only an atomically valid normalized model. On reload failure, retain the last valid model and publish source-aware diagnostics.
- Do not add configuration editing, coordinate/layout hints, discovery, monitoring, authentication, secret fields, Docker packaging, themes, animations, exports, or test files/coverage to this PoC.
- Use automatic ELK layouts; make directed relationship direction and undirected peer connections understandable without colour alone.
- Format at width 80 with no semicolons, single quotes, and trailing commas. Lint correctness and suspicious as errors and perf as warnings.
- The required final automated checks are `bun run fmt:check`, `bun run lint`, `bun run typecheck`, and `bun run build`.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `package.json`, `tsconfig*.json`, `vite.config.ts`, `.oxlintrc.json`, `.oxfmtrc.json` | Single-package tooling, client proxy, and repository conventions. |
| `src/domain/schema.ts` | Strict Zod source schemas, inferred raw types, JSON Schema export. |
| `src/domain/types.ts` | Normalized entities, typed relationship edges, diagnostics, API payloads. |
| `src/domain/load.ts` | Safe recursive import resolution and YAML parsing with source locations. |
| `src/domain/validate.ts` | Cross-file registry, semantic validation, cycle checks, normalization, and relationship derivation. |
| `src/domain/index.ts` | `loadHomelab(rootPath)` orchestration and stable public domain interface. |
| `src/server/app.ts`, `src/server/main.ts` | HTTP API, static assets, SSE hub, command arguments, atomic reload/watch lifecycle. |
| `src/client/main.tsx`, `src/client/App.tsx` | Vite entry point and shell-level model/diagnostic, tab, search, and selection state. |
| `src/client/api.ts`, `src/client/navigation.ts` | Read-only API/SSE client and canonical-view/relationship navigation helpers. |
| `src/client/views/*.tsx`, `src/client/views/adapters.ts` | Per-layer model-to-graph adapters, ELK configuration, and React Flow rendering. |
| `src/client/components/*.tsx`, `src/client/styles.css` | Search, details, status, shared canvas controls, accessible basic CSS. |
| `schema/homelab.schema.json`, `scripts/generate-schema.ts` | Deterministically generated authoring schema and its generator. |
| `examples/*.yaml` | Complete, split, non-secret configuration used for manual acceptance. |
| `docs/configuration.md` | Configuration reference, authoring guide, safety warning, and LLM prompt. |

## Task 1: Scaffold the single-package application

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.server.json`, `tsconfig.client.json`, `vite.config.ts`, `.oxlintrc.json`, `.oxfmtrc.json`, `.gitignore`, `index.html`
- Create: `src/client/main.tsx`, `src/client/App.tsx`, `src/server/main.ts`, `src/domain/index.ts`

**Interfaces:**
- Produces scripts: `dev`, `start`, `build`, `typecheck`, `lint`, `fmt`, `fmt:check`, `schema:generate`, and `test`.
- Produces `vite.config.ts` proxying `/api` and `/events` to the local Bun server during development.

- [ ] **Step 1: Create the package manifest and install the required stable dependencies**

  Include runtime dependencies `@xyflow/react`, `elkjs`, `react`, `react-dom`, `yaml`, and `zod`; include development dependencies `@tsconfig/strictest`, Bun types, React types, TypeScript, Vite, Vitest, Oxlint, and Oxfmt. Define the development command so the Bun server receives the root YAML argument while Vite runs concurrently, for example:

  ```json
  {
    "type": "module",
    "scripts": {
      "dev": "bun run src/server/main.ts --dev",
      "start": "bun run src/server/main.ts",
      "build": "vite build",
      "typecheck": "tsc -p tsconfig.server.json && tsc -p tsconfig.client.json",
      "lint": "oxlint --type-aware --no-error-on-unmatched-pattern",
      "fmt": "oxfmt",
      "fmt:check": "oxfmt --check",
      "schema:generate": "bun run scripts/generate-schema.ts",
      "test": "vitest run"
    }
  }
  ```

- [ ] **Step 2: Add strict, split TypeScript configuration and matching lint/format configuration**

  Make `tsconfig.server.json` include Bun types and `src/server`, `src/domain`, and `scripts`; make `tsconfig.client.json` include Vite/DOM types and `src/client`. Both extend `@tsconfig/strictest/tsconfig.json` and set `moduleResolution: 'bundler'` and `noEmit: true`. Set Oxlint categories and ignore patterns exactly as specified.

- [ ] **Step 3: Add minimal typed client and server entries, then verify the toolchain**

  The server entry should parse its final positional argument later, but initially fail with a concise usage message when absent. The React entry should render a placeholder `App`. Configure Vite with `src/client/main.tsx` as its entry and proxy requests to the Bun port.

  Run: `bun install && bun run fmt && bun run typecheck && bun run lint && bun run build`

  Expected: dependencies resolve into `bun.lock`, and all four checks pass.

- [ ] **Step 4: Commit the scaffold**

  ```bash
  git add package.json bun.lock tsconfig.json tsconfig.server.json tsconfig.client.json vite.config.ts .oxlintrc.json .oxfmtrc.json .gitignore index.html src
  git commit -m "chore: scaffold homelab visualizer"
  ```

## Task 2: Define the strict configuration contract and JSON Schema generator

**Files:**
- Create: `src/domain/schema.ts`, `src/domain/types.ts`, `scripts/generate-schema.ts`, `schema/homelab.schema.json`
- Modify: `package.json`

**Interfaces:**
- Produces `rootDocumentSchema`, `importDocumentSchema`, and inferred raw entity types.
- Produces `z.toJSONSchema(rootDocumentSchema, { target: 'draft-2020-12' })` as `schema/homelab.schema.json`.
- Produces shared types:

  ```ts
  export type Diagnostic = {
    category: DiagnosticCategory
    message: string
    file: string
    path: string
    line?: number
    column?: number
  }
  export type RelationshipEdge = {
    source: string
    target: string
    type: RelationshipType
    label?: string
    direction: 'directed' | 'undirected'
    origin: 'declared' | 'derived'
  }
  ```

- [ ] **Step 1: Define reusable strict common-field and scalar schemas**

  Use `z.strictObject` for each object. Require IDs to match `^[a-z][a-z0-9-]*$`; constrain links and endpoints to labelled `http`/`https` URLs; represent common fields (`id`, `name`, `description`, `tags`, `notes`, `links`) once and extend them. Define strict CIDR, IP, MAC, VLAN, resource, and string-map schemas that retain values for later semantic format validation where a parser is needed.

- [ ] **Step 2: Define all layer entity schemas and the two document schemas**

  Encode the exact enums and required references from the spec. The root schema requires `version: z.literal(1)` and strict `site`; imported files explicitly omit `version` and `site`. Both document schemas allow only `imports`, `hardwareGroups`, `devices`, `networks`, `interfaces`, `networkLinks`, `compute`, and `applications`, with collections defaulting to empty arrays after parsing.

- [ ] **Step 3: Generate and commit the schema from the Zod contract**

  Implement `scripts/generate-schema.ts` as a deterministic writer of prettified JSON plus a trailing newline. Give the JSON Schema a stable `$id` such as `https://example.invalid/homelab.schema.json`, and make `schema:generate` overwrite only `schema/homelab.schema.json`.

  Run: `bun run schema:generate && bun run fmt:check && bun run typecheck`

  Expected: the generated file is valid JSON, contains strict entity definitions, and the type check passes.

- [ ] **Step 4: Commit the domain contract**

  ```bash
  git add src/domain/schema.ts src/domain/types.ts scripts/generate-schema.ts schema/homelab.schema.json package.json bun.lock
  git commit -m "feat: define homelab configuration schema"
  ```

## Task 3: Load YAML documents safely with imports and source-aware structural diagnostics

**Files:**
- Create: `src/domain/load.ts`
- Modify: `src/domain/types.ts`, `src/domain/index.ts`

**Interfaces:**
- Produces `loadDocuments(rootPath: string): Promise<LoadResult>` where `LoadResult` is either `{ ok: true; rootPath: string; documents: LoadedDocument[] }` or `{ ok: false; diagnostics: Diagnostic[] }`.
- `LoadedDocument` contains absolute `path`, root-relative display `file`, parsed strict document data, and a `yaml.Document` retained for path-to-location lookup.

- [ ] **Step 1: Implement root-path validation and recursive import traversal**

  Resolve the supplied root file and use its directory as the confinement root. For each declared import, reject absolute paths, non-YAML extensions, a resolved path outside that directory, re-imported resolved files, and files already in the recursion stack. Traverse imports in declaration order before adding the current document, so entity merging follows import order and the root is processed last.

- [ ] **Step 2: Parse YAML and preserve diagnostic locations**

  Parse with `yaml` document APIs and alias-expansion safeguards. Convert parser errors and warnings that prevent a usable document into `yaml-syntax` diagnostics. Implement one helper that maps a YAML path to `line`/`column` from the retained document and consistently uses the root-relative filename.

- [ ] **Step 3: Validate each parsed document structurally before returning it**

  Select the root or import Zod schema by document role, call `safeParse`, and convert every Zod issue into a `structural-schema` diagnostic with the issue path and its closest YAML location. Do not proceed with partial valid values from a document with any structural error.

- [ ] **Step 4: Add loader orchestration to the domain public API and verify it manually**

  `src/domain/index.ts` should expose the loader but not server implementation details. Run it against a valid one-file scratch configuration and separately an import escaping `../`; inspect that the latter returns a filesystem/import diagnostic with a path rather than a stack trace.

  Run: `bun run fmt:check && bun run lint && bun run typecheck`

  Expected: the loader compiles cleanly and unsafe import paths are rejected before file contents are used.

- [ ] **Step 5: Commit YAML loading**

  ```bash
  git add src/domain/load.ts src/domain/types.ts src/domain/index.ts
  git commit -m "feat: load imported homelab YAML safely"
  ```

## Task 4: Normalize and semantically validate the domain model

**Files:**
- Create: `src/domain/validate.ts`
- Modify: `src/domain/types.ts`, `src/domain/index.ts`

**Interfaces:**
- Produces `validateDocuments(load: SuccessfulLoadResult): DomainResult` returning either diagnostics or:

  ```ts
  export type HomelabModel = {
    version: 1
    site: Site
    entities: Record<string, HomelabEntity>
    entityIdsByKind: Record<EntityKind, string[]>
    relationships: RelationshipEdge[]
  }
  ```
- Produces `loadHomelab(rootPath: string): Promise<DomainResult>` as the single server-facing domain entry point.

- [ ] **Step 1: Merge collections into one typed entity registry and detect duplicates**

  Iterate loaded documents in loader order. Register all entity types except `networkLinks`, which are declarations rather than entities; report every duplicate global ID with both the duplicate location and a message naming the original file. Keep entity source metadata internally for semantic diagnostics, but omit it from the browser model.

- [ ] **Step 2: Validate references, scalar formats, and link safety**

  Validate every reference against the global registry and enforce its target type: group parent/group, interface owner/device-or-compute, interface network/network, host device/device, VM/container runsOn/compute, and application runsOn/dependency/application. Validate CIDRs and IP addresses with an IP/CIDR parser, MAC addresses using a canonical six-octet pattern, VLAN rules, `networkLinks` self-links and unordered duplicate pairs, and URL protocol with `new URL(value).protocol` restricted to `http:`/`https:`. Emit diagnostics that include the offending value, expected constraint, entity field path, and location.

- [ ] **Step 3: Detect prohibited cycles with explicit paths**

  Use DFS colour/state maps for import traversal (already handled by the loader), hardware-group parent containment, and compute placement. For compute, additionally walk every VM/container chain to ensure it reaches a host, a VM only has a host parent, and a container parent is host or VM. Report the cycle sequence in the diagnostic message; allow application dependency cycles.

- [ ] **Step 4: Derive canonical directed and undirected relationships**

  Create declared undirected `network-link` edges and declared directed application dependency edges (`source` depends on `target`). Derive directed edges for device-to-group, host-to-device, VM/container-to-parent, application-to-runsOn, interface-to-owner, and interface-to-network. Every edge must set `type`, `direction`, `origin`, and optional label consistently.

- [ ] **Step 5: Expose only a fully valid normalized result and run checks**

  Make `loadHomelab` run load then semantic validation and return the model only when diagnostics are empty. Run `bun run fmt:check && bun run lint && bun run typecheck`.

  Expected: no consumer can receive a partial or semantically invalid model.

- [ ] **Step 6: Commit model validation**

  ```bash
  git add src/domain/validate.ts src/domain/types.ts src/domain/index.ts
  git commit -m "feat: validate and normalize homelab models"
  ```

## Task 5: Build the server API, atomic reload lifecycle, and development/prod serving

**Files:**
- Create: `src/server/app.ts`, `src/server/reload.ts`
- Modify: `src/server/main.ts`, `vite.config.ts`, `src/domain/types.ts`

**Interfaces:**
- Produces `createHomelabServer({ rootPath, dev, port? })` with `start()`, `reload()`, and `stop()`.
- Exposes `GET /api/model`, `GET /api/diagnostics`, and `GET /events`.
- SSE event shape: `{ type: 'model-updated' | 'validation-failed'; diagnostics: Diagnostic[] }`.

- [ ] **Step 1: Implement a stateful reload controller around `loadHomelab`**

  Keep `lastValidModel: HomelabModel | undefined`, current diagnostics, and the set of successfully resolved files. On success, replace the model, clear diagnostics, update watched paths, and emit `model-updated`. On failure, replace diagnostics only, retain `lastValidModel`, and emit `validation-failed`. Catch unexpected errors, log technical detail to stderr, and expose exactly one generic diagnostic without a raw stack trace.

- [ ] **Step 2: Watch every loaded YAML file with debouncing**

  Use Bun file watching facilities or `fs.watch` compatible with Bun. Coalesce saves using one short timeout, perform one atomic reload attempt after the debounce, and replace the watcher set only after a successful reload. Ensure shutdown closes watchers and all SSE subscribers.

- [ ] **Step 3: Implement read-only API and SSE endpoints**

  Return `200` plus the normalized model from `/api/model` when one exists; otherwise return an explicit no-valid-model payload suitable for the client error state. Return diagnostics from `/api/diagnostics`. Set `text/event-stream`, disable caching, send a keepalive comment, and remove SSE clients on request abort. Do not add any mutation route.

- [ ] **Step 4: Wire CLI arguments and Vite/static asset serving**

  Require one root YAML positional argument in both `bun run dev -- path` and `bun run start -- path`. In dev, start/configure Vite so browser traffic reaches the Vite client and API/SSE proxy reaches Bun. In production, serve `dist` assets with SPA fallback while reserving `/api` and `/events` for the server.

- [ ] **Step 5: Verify API behaviour with the forthcoming bundled example once it exists, then run static checks**

  Run: `bun run fmt:check && bun run lint && bun run typecheck`

  Expected: server code has no Node-only type leaks, and both model and diagnostics payloads are serializable.

- [ ] **Step 6: Commit server lifecycle**

  ```bash
  git add src/server src/domain/types.ts vite.config.ts
  git commit -m "feat: serve homelab model with atomic reloads"
  ```

## Task 6: Create shared browser data, navigation, and shell state

**Files:**
- Create: `src/client/api.ts`, `src/client/navigation.ts`, `src/client/components/Search.tsx`, `src/client/components/StatusBar.tsx`
- Modify: `src/client/App.tsx`, `src/client/main.tsx`

**Interfaces:**
- Produces `fetchInitialState(): Promise<ClientState>` and `subscribeReloads(onEvent): () => void`.
- Produces `canonicalViewFor(entity: HomelabEntity): ViewId` where `ViewId` is `'hardware' | 'network' | 'compute' | 'applications'`.
- `App` owns `{ model, diagnostics, activeView, selectedId }` and exposes `selectEntity(id: string): void` to children.

- [ ] **Step 1: Implement initial API fetch and resilient SSE subscription**

  Fetch model and diagnostics on startup; create an `EventSource` for `/events`. On `model-updated`, refetch the model and diagnostics. On `validation-failed`, refetch diagnostics but preserve the already rendered model. Surface connection failures in the compact status region and clean up the event source on unmount.

- [ ] **Step 2: Implement canonical navigation and selection persistence**

  Map group/device to hardware, network/interface to network, compute to compute, and application to applications. A search or details relationship selection switches to this view and sets the selected ID. On successful model replacement, preserve active view and selected ID only when the new registry contains it; otherwise clear selection. Tab changes preserve selection but never force an entity into a view where it has no representation.

- [ ] **Step 3: Build the accessible shell, tabs, global search, and diagnostic states**

  Use semantic buttons with `aria-selected` for the four tabs and labelled keyboard-accessible search. Search ID, name, and tags across all entity kinds, display name/ID/kind, and call canonical selection on activation. Render a full error state when no valid model exists, otherwise reserve canvas and details-panel regions plus a compact reload/diagnostic status area.

- [ ] **Step 4: Run browser build verification**

  Run: `bun run fmt:check && bun run lint && bun run typecheck && bun run build`

  Expected: the browser has no direct filesystem imports and production bundling succeeds.

- [ ] **Step 5: Commit shared client shell**

  ```bash
  git add src/client
  git commit -m "feat: add homelab browser shell and navigation"
  ```

## Task 7: Implement shared graph rendering and automatic ELK layout

**Files:**
- Create: `src/client/views/layout.ts`, `src/client/views/GraphCanvas.tsx`, `src/client/views/types.ts`
- Modify: `src/client/App.tsx`

**Interfaces:**
- Produces `layoutGraph(nodes: GraphNode[], edges: GraphEdge[], options: ElkOptions): Promise<LaidOutGraph>`.
- Produces `GraphCanvas({ graph, selectedId, onSelectEntity, onFocusReady })` using `@xyflow/react`.
- View adapters return `{ nodes, edges, groups?, layoutOptions }` and never mutate `HomelabModel`.

- [ ] **Step 1: Define view-neutral graph node/edge data and ELK translation**

  Model node ID, label, entity ID, kind, optional parent/group, and concise metadata separately from React Flow internals. Translate these to ELK children/edges, request layered layout with explicit direction and spacing, then map calculated x/y back into React Flow nodes. Treat containment/group nodes as compound nodes and use size estimates that accommodate labels and metadata.

- [ ] **Step 2: Render a read-only React Flow canvas with accessible interaction**

  Disable connect, drag, delete, and edit behaviours. Enable pan, zoom, fit-view, and a labelled focus-selected control. Use visible node labels, edge labels/markers for direction, and a non-colour indication for peer links (for example, an undirected line label); selection must call the shell callback.

- [ ] **Step 3: Handle asynchronous layouts safely**

  Recompute graph layout when model/view data changes, show a concise loading state while ELK runs, discard stale layout promises using a request token, and fit the canvas once the current layout is installed. Preserve React state selection through re-layouts.

- [ ] **Step 4: Run checks and commit the graph foundation**

  Run: `bun run fmt:check && bun run lint && bun run typecheck && bun run build`

  ```bash
  git add src/client/views src/client/App.tsx
  git commit -m "feat: add shared automatic graph canvas"
  ```

## Task 8: Add hardware and network view adapters

**Files:**
- Create: `src/client/views/hardware.tsx`, `src/client/views/network.tsx`
- Modify: `src/client/App.tsx`, `src/client/views/adapters.ts`

**Interfaces:**
- Produces `buildHardwareGraph(model: HomelabModel): ViewGraph` and `buildNetworkGraph(model: HomelabModel): ViewGraph`.
- Hardware graph represents hardware groups and devices; network graph represents device/compute owners, interfaces, and networks.

- [ ] **Step 1: Implement the hardware graph adapter**

  Produce compound nodes for groups using parent containment and device nodes placed within their referenced group. Include equipment kind, manufacturer/model, and selected displayable specs in node metadata. Convert derived device-to-group relationships into containment/association visuals and use an ELK option appropriate to physical grouping.

- [ ] **Step 2: Implement the network graph adapter**

  Include only devices and compute entities that own interfaces, their interface attachment-point nodes, and network nodes. Draw declared peer links as undirected connections with their optional labels; represent derived owner/network attachment edges with distinguishable labels/markers. Show interface addresses, MAC where present, network CIDR, and VLAN in concise metadata.

- [ ] **Step 3: Connect both adapters to tab rendering and selection**

  Select a node through `GraphCanvas` to set its entity selection. Nodes used solely as visual owner context may select that owner; interfaces and networks must be directly selectable. Do not show application-only entities in these adapters.

- [ ] **Step 4: Verify build and commit**

  Run: `bun run fmt:check && bun run lint && bun run typecheck && bun run build`

  ```bash
  git add src/client/views/hardware.tsx src/client/views/network.tsx src/client/views/adapters.ts src/client/App.tsx
  git commit -m "feat: visualize hardware and network layers"
  ```

## Task 9: Add compute and application view adapters

**Files:**
- Create: `src/client/views/compute.tsx`, `src/client/views/applications.tsx`
- Modify: `src/client/App.tsx`, `src/client/views/adapters.ts`

**Interfaces:**
- Produces `buildComputeGraph(model: HomelabModel): ViewGraph` and `buildApplicationsGraph(model: HomelabModel): ViewGraph`.
- Compute graph represents hosts, VMs, and containers; applications graph represents applications grouped by deployment target.

- [ ] **Step 1: Implement compute placement visualization**

  Build host compound nodes with VM/container descendants nested under their direct `runsOn` parent. Render derived placement edges from dependent VM/container to parent with direction markers and display kind plus declared CPU, memory, and storage values. Include backing-device context in host metadata without duplicating the entire hardware diagram.

- [ ] **Step 2: Implement applications visualization**

  Group application nodes by their `runsOn` compute target, include endpoint labels/hosts in node metadata, and draw application `dependsOn` relationships source-to-target with unambiguous directed arrows. Show the deployment relationship as group/label context, and retain cycles rather than attempting a topological layout that removes them.

- [ ] **Step 3: Connect adapters and validate cross-view selection behaviour**

  Render only the active adapter. Confirm selected compute and application entities focus within their canonical views; changing to a layer with no matching node must leave the canvas unforced while retaining the selection for the details panel.

- [ ] **Step 4: Verify build and commit**

  Run: `bun run fmt:check && bun run lint && bun run typecheck && bun run build`

  ```bash
  git add src/client/views/compute.tsx src/client/views/applications.tsx src/client/views/adapters.ts src/client/App.tsx
  git commit -m "feat: visualize compute and application layers"
  ```

## Task 10: Add details, relationship navigation, and basic accessible styling

**Files:**
- Create: `src/client/components/DetailsPanel.tsx`, `src/client/components/ExternalLink.tsx`
- Create: `src/client/styles.css`
- Modify: `src/client/App.tsx`, `src/client/main.tsx`

**Interfaces:**
- Produces `DetailsPanel({ model, selectedId, onSelectEntity })`.
- Produces `externalLinkProps(url)` returning `{ target: '_blank', rel: 'noopener noreferrer' }` only for already-validated HTTP(S) URLs.

- [ ] **Step 1: Render all common and type-specific entity details**

  Show ID, name, description, tags, notes, links, and then entity-specific facts: group kind/parent, device kind/manufacturer/model/specs, network kind/CIDR/VLAN, interface owner/network/addresses/MAC, compute kind/placement/device/resources, and application deployment/dependencies/endpoints. Render links and endpoints as labelled new-tab anchors with `rel="noopener noreferrer"`.

- [ ] **Step 2: Compute direct relationship sections from normalized edges**

  For the selected ID, list directed edge targets under Upstream, directed edge sources under Downstream, and either endpoint of undirected edges under Connections. Group entries by relationship type, label direction in text, deduplicate display entries, and make every related entity a keyboard-accessible button that calls canonical navigation.

- [ ] **Step 3: Add only the required CSS and visual semantics**

  Establish a fixed readable desktop layout with tab/search header, flexible canvas, fixed-width details panel, and status footer. Add visible focus states, readable node/card spacing, error styles, and narrow-screen overflow/stacking that preserves reachable controls. Do not add a theme system, motion, gradients, decorative polish, or colour-only relationship meaning.

- [ ] **Step 4: Run static verification and commit**

  Run: `bun run fmt:check && bun run lint && bun run typecheck && bun run build`

  ```bash
  git add src/client/components src/client/styles.css src/client/App.tsx src/client/main.tsx
  git commit -m "feat: add entity details and relationship navigation"
  ```

## Task 11: Add the complete bundled YAML example and authoring documentation

**Files:**
- Create: `examples/homelab.yaml`, `examples/hardware.yaml`, `examples/network.yaml`, `examples/compute.yaml`, `examples/applications.yaml`, `docs/configuration.md`
- Modify: `README.md`, `schema/homelab.schema.json`

**Interfaces:**
- `examples/homelab.yaml` is a directly launchable root configuration importing the four layer files in order.
- `docs/configuration.md` links to `../schema/homelab.schema.json` and is the complete configuration authoring reference.

- [ ] **Step 1: Author a realistic, split, valid configuration**

  Create one room or rack; gateway, managed switch, at least two servers, storage, and UPS; LAN and a VLAN; interfaces with representative documentation-safe addresses and peer links; compute hosts, one VM, and multiple containers; and several applications on more than one target. Include application dependencies, HTTPS endpoints under reserved/example hosts, and labelled dashboard links. Use unique lower-case IDs and include no credentials or secret-like values.

- [ ] **Step 2: Write concise configuration and launch documentation**

  Document the minimal root file, every entity/relationship and allowed fields, global ID/reference rules, import order and directory confinement, relationship direction semantics, and the validation feedback shown on normal launch. Add a prominent warning that configuration is sent to the browser and must not contain secrets. Include a compact LLM authoring prompt/example that calls out strict IDs, exact schema, split imports, and no secrets.

- [ ] **Step 3: Make the README operationally useful**

  Add prerequisites, `bun install`, development and production commands using `examples/homelab.yaml`, the schema generation command, verification commands, and a link to the authoring guide. State that this is a local read-only PoC and has no monitoring or configuration editing.

- [ ] **Step 4: Regenerate the schema and verify static checks**

  Run: `bun run schema:generate && bun run fmt:check && bun run lint && bun run typecheck && bun run build`

  Expected: the generated schema is current and all documentation paths/commands correspond to the repository.

- [ ] **Step 5: Commit the example and documentation**

  ```bash
  git add examples docs/configuration.md README.md schema/homelab.schema.json
  git commit -m "docs: add homelab example and authoring guide"
  ```

## Task 12: Perform end-to-end PoC acceptance verification

**Files:**
- Modify only if an acceptance failure identifies a scoped defect in an earlier task.

**Interfaces:**
- Verifies the production system against the spec; do not introduce automated test files in this PoC.

- [ ] **Step 1: Run all required automated verification from a clean dependency state**

  Run:

  ```bash
  bun run schema:generate
  bun run fmt:check
  bun run lint
  bun run typecheck
  bun run build
  ```

  Expected: every command exits successfully and `schema/homelab.schema.json` is unchanged after generation.

- [ ] **Step 2: Exercise the happy path manually**

  Run `bun run dev -- examples/homelab.yaml`. In a browser, confirm all imports become one model; each of the four tabs produces an automatic useful layout; search finds representative group, network, compute, and application IDs; selecting a result focuses it and opens details; safe endpoint/dashboard links open in a new tab; and relationships navigate to canonical views with correct upstream/downstream direction.

- [ ] **Step 3: Exercise atomic reload and diagnostics manually**

  While the server is running, make a valid visible change to one imported YAML file and confirm the browser updates without restart. Then introduce a reversible invalid reference or malformed scalar, confirm the source file/path diagnostic appears while the previous graph remains, restore the valid value, and confirm diagnostics clear and the model updates.

- [ ] **Step 4: Record only scoped fixes and re-run the failed acceptance check**

  If a failure is found, first identify whether it is domain, server, adapter, navigation, or documentation behaviour; make the smallest fix in that owner; rerun the exact failed check and then the four required automated commands. Do not add test files or expand scope as part of this PoC.

## Plan Self-Review

- Spec coverage: Tasks 1-2 establish the requested package, tooling, schemas, generated JSON Schema, and source-safe configuration contract. Tasks 3-5 cover imports, diagnostics, semantic validation, normalization, APIs, SSE, atomic reload, and local serving. Tasks 6-10 cover all browser shell, canvas, four views, search, selection, details, link safety, relationships, accessibility, and basic CSS requirements. Task 11 supplies the complete example and authoring documentation. Task 12 covers every prescribed manual and automated acceptance criterion.
- Intentional exclusions: no test files or coverage (Vitest is configured only), Docker packaging, editor, coordinate persistence, live infrastructure interactions, authentication/secrets, mobile optimization, themes, animation, or export are planned.
- Placeholder scan: all paths, commands, interfaces, error behaviour, and acceptance actions are specified; there are no implementation placeholders.
- Type consistency: all server-facing consumers use `loadHomelab`, all browser code uses `HomelabModel`, all view adapters produce `ViewGraph`, and all navigation uses `ViewId`/`canonicalViewFor`.
