# Layered Workload Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model locations, network equipment, hardware, VMs, and workloads in five map bands with derived appliance applications and interface VLAN metadata.

**Architecture:** Domain schemas expose the revised entities and derive a normalized model containing VM appliance nodes. A pure graph adapter places those entities in bands and computes transitive placement highlighting. The React client renders the adapter plus VLAN badges; examples and docs demonstrate the new YAML.

**Tech Stack:** TypeScript, Zod, React, React Flow, ELK, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-09-09-layered-workload-model-design.md`

## Global Constraints

- YAML remains the source of truth; generated appliance nodes are browser/model derived only.
- Directed arrows point from dependent workload to its placement/dependency target.
- VLANs are interface metadata, never graph nodes.
- Position dragging stays browser-memory only.

---

### Task 1: Revise the domain schema and semantics

**Files:**
- Modify: `src/domain/schema.ts`, `src/domain/types.ts`, `src/domain/validate.ts`, `src/domain/validate.test.ts`, `scripts/generate-schema.ts`

- [ ] Write failing tests for VM-to-hardware placement, application-to-VM placement, derived appliance application creation, and invalid VLAN metadata.
- [ ] Replace old logical-network/container definitions with location, network equipment, hardware, VM, application, interface, and interface VLAN structures.
- [ ] Validate references and derive `runs-on`, containment, peer-link, and appliance relationships.
- [ ] Run focused domain tests, schema generation, lint, and typecheck.

### Task 2: Adapt the unified graph and presentation

**Files:**
- Modify: `src/client/graph.ts`, `src/client/graph.test.ts`, `src/client/App.tsx`, `src/client/styles.css`

- [ ] Write failing graph tests for five-band placement and transitive upstream highlighting.
- [ ] Implement graph mapping and safe derived appliance node support.
- [ ] Render five bands and deterministic VLAN metadata badges without introducing VLAN nodes.
- [ ] Run focused graph tests, typecheck, and build.

### Task 3: Replace sample configuration and authoring guidance

**Files:**
- Modify: `examples/*.yaml`, `README.md`, `docs/configuration.md`, `schema/homelab.schema.json`

- [ ] Model router/switch, compute/storage hardware, a Docker VM hosting explicit services, and a Plex VM deriving its own appliance application.
- [ ] Document five bands, generated VM application objects, VM/application placement, and VLAN metadata.
- [ ] Run schema generation, formatting, lint, typecheck, tests, and build.
