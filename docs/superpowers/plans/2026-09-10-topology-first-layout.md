# Topology-first layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one topology-aware homelab map that keeps category identity while arranging related subtrees together with fewer crossings and overlapping edges.

**Architecture:** A pure client layout module will construct a single ELK layered graph from the unified graph and map its result to entity positions and category frames. `App` will request that layout once per model revision, use its frames as React Flow background nodes, and retain semantic arrows with distributed handles.

**Tech Stack:** TypeScript, React 19, React Flow, ELK.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-topology-first-layout-design.md`

## Global Constraints

- Use the existing ELK dependency; do not add a second engine or configuration format.
- Keep YAML and domain model APIs unchanged.
- Retain displayed relationship direction even where layout edges are reversed.
- Keep physical connections focus-only; structural topology is visible by default.
- Preserve stale-layout cancellation and the current concise layout-error behaviour.

---

## File structure

- Create `src/client/topology-layout.ts`: pure ELK input construction, category-frame calculation, and position mapping.
- Create `src/client/topology-layout.test.ts`: uneven topology fixture tests for layout inputs and mapped category frames.
- Modify `src/client/graph.ts`: make structural containment default-visible.
- Modify `src/client/graph.test.ts`: test default structural edges.
- Modify `src/client/App.tsx`: replace independent bands and host lanes with the global layout.
- Modify `src/client/styles.css`: persistent category accents.

### Task 1: Expose structural topology by default

**Files:**

- Modify: `src/client/graph.ts`
- Test: `src/client/graph.test.ts`

**Interfaces:** Produces `buildUnifiedGraph(model, selectedId?)` with default `contains`, `network-upstream`, `connected-to`, and `runs-on` edges; physical connections stay selection-gated.

- [ ] **Step 1: Write the failing test**

```ts
test('shows structural containment without focus', () => {
  const graph = buildUnifiedGraph(model)
  expect(graph.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: 'router', target: 'rack', type: 'contains' }),
    expect.objectContaining({ source: 'server', target: 'rack', type: 'contains' }),
  ]))
})
```

- [ ] **Step 2: Confirm the test fails**

Run: `bun test src/client/graph.test.ts`

- [ ] **Step 3: Remove the group-membership selection predicate from `buildUnifiedGraph`**

Keep the existing physical-connection and layer-skipping predicates unchanged.

- [ ] **Step 4: Confirm the test passes**

Run: `bun test src/client/graph.test.ts`

- [ ] **Step 5: Commit**

Run: `git add src/client/graph.ts src/client/graph.test.ts && git commit -m "feat: show structural graph edges by default"`

### Task 2: Build the pure topology layout adapter

**Files:**

- Create: `src/client/topology-layout.ts`
- Test: `src/client/topology-layout.test.ts`

**Interfaces:** Consumes `UnifiedGraph`, node dimensions, and an entity-height callback. Produces `topologyLayoutGraph(graph, dimensions): ElkNode`, `topologyLayoutOptions`, and `categoryFrames(children, width, graph): TopologyBandFrame[]`.

- [ ] **Step 1: Write failing hierarchy-direction and frame tests**

```ts
expect(topologyLayoutGraph(graph, dimensions).edges).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ sources: ['rack'], targets: ['router'] }),
    expect.objectContaining({ sources: ['router'], targets: ['switch'] }),
    expect.objectContaining({ sources: ['switch'], targets: ['server'] }),
    expect.objectContaining({ sources: ['server'], targets: ['docker-vm'] }),
  ]),
)
expect(categoryFrames(children, 720, graph)).toEqual(expect.arrayContaining([
  expect.objectContaining({ band: 'Locations' }),
  expect.objectContaining({ band: 'Network' }),
]))
```

- [ ] **Step 2: Confirm the test fails because the module does not exist**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 3: Implement one ELK layered graph**

```ts
export const topologyLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.spacing.nodeNode': '72',
} as const
```

Create layout edges only for `contains`, `network-upstream`, `connected-to`, and `runs-on`; reverse them so sources are logical parents. Categorise returned children through the unified-node lookup and calculate padded, vertically ordered, non-overlapping category frame rectangles.

- [ ] **Step 4: Confirm the adapter tests pass**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 5: Commit**

Run: `git add src/client/topology-layout.ts src/client/topology-layout.test.ts && git commit -m "feat: add topology-aware layout adapter"`

### Task 3: Adopt the global layout in the canvas

**Files:**

- Modify: `src/client/App.tsx`
- Modify: `src/client/styles.css`
- Test: `src/client/topology-layout.test.ts`

**Interfaces:** Consumes `topologyLayoutGraph`, `topologyLayoutOptions`, and `categoryFrames`; produces one asynchronous ELK request per map revision and `entity-<band>` React Flow classes.

- [ ] **Step 1: Add unequal-fan-out input to the adapter fixture**

The fixture must contain one parent with one child, a sibling parent with five children, and workloads under one of those children. Assert every entity becomes an ELK child and every structural relationship becomes one layout edge.

- [ ] **Step 2: Confirm the expanded adapter test passes**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 3: Replace the per-band layout effect**

```ts
const baseGraph = buildUnifiedGraph(model)
const layout = await elk.layout(topologyLayoutGraph(baseGraph, dimensions))
const frames = categoryFrames(layout.children ?? [], layout.width ?? 720, baseGraph)
```

Map frames to existing `band` nodes, then map each entity from its one ELK `x` and `y`. Delete `hostId`, `hostLaneLayout`, `laneGap`, and the per-band `Promise.all`. Preserve cancellation, errors, state updates, and viewport fitting.

- [ ] **Step 4: Add persistent category accents**

```tsx
className={`entity-node entity-${byId.get(node.id)?.band.toLowerCase()}${byId.get(node.id)?.dimmed ? ' dimmed' : ''}`}
```

Add a distinct top-border colour for each category, preserving selected-node styling.

- [ ] **Step 5: Run affected tests**

Run: `bun test src/client/graph.test.ts src/client/topology-layout.test.ts`

- [ ] **Step 6: Commit**

Run: `git add src/client/App.tsx src/client/styles.css src/client/topology-layout.ts src/client/topology-layout.test.ts && git commit -m "feat: render topology-first map layout"`

### Task 4: Verify and host the integrated client

**Files:** no source changes expected.

- [ ] **Step 1: Run repository verification**

Run: `bun run fmt:check && bun run typecheck && bun run lint && bun test && bun run build`

- [ ] **Step 2: Start the requested host-bound server**

Run: `bun run dev -- --host 0.0.0.0`

Confirm a non-loopback URL is reported, retain its process identifier, and report the URL to the user.

## Self-review

- Spec coverage: Tasks 1–3 implement default structural edges, global topology-aware ELK, category frames and accents, layout-only reversed hierarchy edges, focus-only physical connections, and async failure preservation. Task 4 verifies and hosts the result.
- Placeholder scan: no `TBD`, `TODO`, deferred implementation, or generic test instruction remains.
- Type consistency: Task 2 defines `topologyLayoutGraph`, `topologyLayoutOptions`, and `categoryFrames`; Task 3 consumes those exact names.

