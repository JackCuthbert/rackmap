# Primary topology layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a compact, deterministic primary-topology map without node overlap or avoidable child-edge crossings.

**Architecture:** Replace global ELK positions and post-layout coordinate rewrites with a pure bottom-up forest layout. Network upstream, hardware attachment, VM placement, and application placement form primary trees; location membership remains contextual. Parent subtree dimensions determine sibling placement before any card coordinates are returned.

**Tech Stack:** TypeScript, React Flow, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-primary-topology-layout-design.md`

## Global Constraints

- Preserve the YAML schema, domain model, node cards, selection, and semantic arrow directions.
- Locations are compact context, never primary topology parents.
- Applications use at most five columns per VM.
- Category and node rectangles must not overlap.
- Keep physical connections focus-only.

---

## File structure

- Replace `src/client/topology-layout.ts` with pure primary-forest measurement and positioning helpers.
- Replace `src/client/topology-layout.test.ts` with primary-tree fixtures that assert coordinates, subtree order, grids, and no overlaps.
- Modify `src/client/App.tsx` to use the deterministic layout synchronously rather than invoking ELK.
- Remove unused `elkjs` dependency only if no client import remains after implementation.

### Task 1: Define and test primary topology forest construction

**Files:**

- Modify: `src/client/topology-layout.ts`
- Test: `src/client/topology-layout.test.ts`

**Interfaces:** Produces `primaryTopology(graph): Map<string, string[]>`, where keys are parent IDs and values are child IDs ordered by graph node order. The hierarchy includes reversed `network-upstream`, reversed `connected-to`, and reversed `runs-on` edges only.

- [ ] **Step 1: Write the failing forest test**

```ts
expect(primaryTopology(graph)).toMatchObject(
  new Map([
    ['router', ['switch']],
    ['switch', ['small-host', 'large-host']],
    ['small-host', ['small-vm']],
  ]),
)
```

- [ ] **Step 2: Confirm failure**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 3: Implement primary-edge reversal and deterministic child ordering**

Use only `network-upstream`, `connected-to`, and `runs-on`; append each edge target-to-source relation in the order it appears in `graph.edges`.

- [ ] **Step 4: Confirm the forest test passes**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 5: Commit**

Run: `git add src/client/topology-layout.ts src/client/topology-layout.test.ts && git commit -m "feat: build primary topology forest"`

### Task 2: Measure and position subtrees

**Files:**

- Modify: `src/client/topology-layout.ts`
- Test: `src/client/topology-layout.test.ts`

**Interfaces:** Produces `layoutPrimaryTopology(graph, dimensions): TopologyLayout`, with `nodes: LayoutChild[]` and `frames: TopologyBandFrame[]`.

- [ ] **Step 1: Write failing compact-subtree assertions**

```ts
const layout = layoutPrimaryTopology(graph, dimensions)
expect(position(layout, 'small-host').x).toBeLessThan(position(layout, 'large-host').x)
expect(position(layout, 'small-vm').x).toBe(position(layout, 'small-host').x)
expect(overlaps(layout.nodes)).toBe(false)
```

- [ ] **Step 2: Confirm failure**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 3: Implement bottom-up measurement**

Measure leaf width as card width. Measure an internal node as the maximum of its card width and its children’s total width plus 72px gaps. Assign child subtrees into their measured horizontal regions and centre each parent card over its region. Assign Network, Hardware, Virtualisation, and Applications fixed category tops after group context; never reuse ELK coordinates.

- [ ] **Step 4: Confirm compact-subtree assertions pass**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 5: Commit**

Run: `git add src/client/topology-layout.ts src/client/topology-layout.test.ts && git commit -m "feat: position primary topology subtrees"`

### Task 3: Lay out application grids and contextual groups

**Files:**

- Modify: `src/client/topology-layout.ts`
- Test: `src/client/topology-layout.test.ts`

**Interfaces:** `layoutPrimaryTopology` returns application child coordinates in a five-column grid and a compact Locations frame. Unattached hardware receives compact Hardware coordinates after primary descendants.

- [ ] **Step 1: Write failing grid and context tests**

```ts
const applications = layout.nodes.filter((node) => node.id.startsWith('app-'))
expect(new Set(applications.map((node) => node.y)).size).toBe(2)
expect(position(layout, 'small-vm').x).toBe(576)
expect(position(layout, 'ups').y).toBe(position(layout, 'small-host').y)
expect(layout.frames[0]).toMatchObject({ band: 'Locations' })
```

- [ ] **Step 2: Confirm failure**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 3: Implement five-column grids and compact secondary context**

Use `application.runsOn` groups to calculate grid width/height. Place groups under their VM’s allocated subtree. Lay out groups in a compact parent-ordered row strip and omit group-membership edges from primary positioning. Append unattached hardware in a compact trailing hardware row.

- [ ] **Step 4: Confirm grid and context tests pass**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 5: Commit**

Run: `git add src/client/topology-layout.ts src/client/topology-layout.test.ts && git commit -m "feat: grid application topology children"`

### Task 4: Adopt the deterministic layout in the canvas

**Files:**

- Modify: `src/client/App.tsx`
- Modify: `package.json`
- Modify: `bun.lock`

**Interfaces:** Consumes `layoutPrimaryTopology(baseGraph, dimensions)`; creates React Flow entity nodes and category frames from its return value without calling ELK.

- [ ] **Step 1: Write a failing adapter test proving no overlapping output from the production fixture**

```ts
expect(overlaps(layoutPrimaryTopology(graph, dimensions).nodes)).toBe(false)
```

- [ ] **Step 2: Confirm failure before integrating the adapter**

Run: `bun test src/client/topology-layout.test.ts`

- [ ] **Step 3: Replace ELK effect plumbing in `App.tsx`**

Build `baseGraph`, call `layoutPrimaryTopology`, map its frames to band nodes, and map its positioned entity nodes to React Flow cards. Retain cancellation/error handling but remove ELK imports and asynchronous `elk.layout` work.

- [ ] **Step 4: Remove `elkjs` from dependencies and lockfile only after no source import remains**

Run: `bun remove elkjs`

- [ ] **Step 5: Verify client integration**

Run: `bun test src/client/topology-layout.test.ts src/client/graph.test.ts && bun ./node_modules/typescript/bin/tsc -p tsconfig.client.json`

- [ ] **Step 6: Commit**

Run: `git add src/client/topology-layout.ts src/client/topology-layout.test.ts src/client/App.tsx package.json bun.lock && git commit -m "feat: render deterministic primary topology"`

### Task 5: Verify and review

- [ ] **Step 1: Run verification**

Run: `bun ./node_modules/oxfmt/bin/oxfmt --check --no-error-on-unmatched-pattern package.json vite.config.ts src scripts && bun ./node_modules/typescript/bin/tsc -p tsconfig.server.json && bun ./node_modules/typescript/bin/tsc -p tsconfig.client.json && bun test && bun ./node_modules/vite/bin/vite.js build`

- [ ] **Step 2: Refresh the approved host-bound review server**

Confirm the existing Vite review URL serves the updated client and report it.

## Self-review

- Spec coverage: Tasks 1–4 replace the conflicting layout strategy with a primary forest, bottom-up subtree measurement, five-column application grids, compact locations, compact unattached hardware, and non-overlapping frames.
- Placeholder scan: no deferred implementation markers or unspecified test steps remain.
- Type consistency: Task 1 defines `primaryTopology`; Tasks 2–4 consume `layoutPrimaryTopology` and `TopologyLayout`.

