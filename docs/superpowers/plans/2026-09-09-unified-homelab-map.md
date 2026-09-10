# Unified Homelab Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tabbed visualizer with a usable unified layered map and enforce the missing placement invariants.

**Architecture:** A pure client graph adapter assigns every entity to one of four fixed bands and selects the rendered relationship set. `App` owns React Flow state and applies asynchronous ELK positions, while CSS supplies the stable utilitarian shell and band treatment. Domain validation verifies reference types first, then follows valid parent chains to report cycles and invalid compute placement.

**Tech Stack:** React, React Flow, ELK, TypeScript, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-09-09-homelab-visualizer-design.md`

## Global Constraints

- YAML remains the only source of truth; node coordinates are browser-memory only.
- Canvas direction is Hardware, Network, Compute, Applications from top to bottom.
- Directed displayed edges go from a dependent entity to what it relies on.
- Network peer links are dashed and have no arrowhead.
- Configuration and browser payloads must not contain secrets.

---

### Task 1: Enforce containment and compute-placement constraints

**Files:**
- Modify: `src/domain/validate.ts`
- Create: `src/domain/validate.test.ts`

**Interfaces:**
- Produces `validateDocuments(load): DomainResult` diagnostics with category `cycle` for a closed valid parent chain and `invalid-reference` for an invalid compute parent kind.

- [ ] **Step 1: Write failing validation tests**

```ts
expect(validateDocuments(loadWithCompute([{ id: 'vm-a', kind: 'vm', runsOn: 'vm-b' }, { id: 'vm-b', kind: 'vm', runsOn: 'vm-a' }]))).toMatchObject({ ok: false })
expect(validateDocuments(loadWithCompute([{ id: 'container-a', kind: 'container', runsOn: 'container-b' }, { id: 'container-b', kind: 'container', runsOn: 'host-a' }, { id: 'host-a', kind: 'host', device: 'server-a' }]))).toMatchObject({ ok: false })
```

- [ ] **Step 2: Run `bun test src/domain/validate.test.ts` and confirm the cycle test fails because validation currently never traverses parents.**
- [ ] **Step 3: Implement DFS over registry entries and validate host/VM/container parent combinations and host termination.**
- [ ] **Step 4: Run `bun test src/domain/validate.test.ts` and confirm every new behavior passes.**

### Task 2: Build the unified graph adapter

**Files:**
- Create: `src/client/graph.ts`, `src/client/graph.test.ts`

**Interfaces:**
- Produces `buildUnifiedGraph(model, selectedId)` returning graph nodes with `band`, default primary edges, peer edges, and selected-node secondary edges.
- Produces `bandFor(entityKind)` mapping hardwareGroup/device, network/interface, compute, and application into the four bands.

- [ ] **Step 1: Write failing adapter tests asserting all entity kinds remain present, only placement/dependency/network-link edges appear unselected, and selected interface-derived edges appear on selection.**
- [ ] **Step 2: Run `bun test src/client/graph.test.ts` and confirm it fails because the adapter is absent.**
- [ ] **Step 3: Implement literal band and edge filtering rules; annotate dimmed graph items from the selected node's direct relationship path.**
- [ ] **Step 4: Run `bun test src/client/graph.test.ts` and confirm the adapter contract passes.**

### Task 3: Render the unified interactive map

**Files:**
- Modify: `src/client/App.tsx`, `src/client/styles.css`

**Interfaces:**
- Consumes `buildUnifiedGraph(model, selectedId)`.
- Keeps `selectedId` and React Flow node state in `App`; node dragging only updates local node state.

- [ ] **Step 1: Replace the tab/filter graph construction with adapter output and one four-band canvas.**
- [ ] **Step 2: Use layout-only reversed hierarchy edges plus per-band ELK constraints to retain the top-down band order while rendering dependency arrows in their semantic direction.**
- [ ] **Step 3: Enable local node dragging, preserve a drag position until the next layout, and apply selected/dimmed edge and node classes.**
- [ ] **Step 4: Replace tab styling with compact search/status controls, a labelled band legend, readable details cards, and clear keyboard focus states.**
- [ ] **Step 5: Run `bun run typecheck && bun run build`.**

### Task 4: Complete documentation and acceptance instructions

**Files:**
- Create: `docs/configuration.md`, `README.md`

- [ ] **Step 1: Document configuration fields, reference and placement rules, import constraints, relationship directions, schema generation, and the no-secrets warning.**
- [ ] **Step 2: Document the unified-map manual acceptance checks: bands, default/selection edges, drag reset, search/details, reload, and diagnostics.**
- [ ] **Step 3: Run `bun run schema:generate && bun run fmt:check && bun run lint && bun run typecheck && bun run build`.**
