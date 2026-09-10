# Client YAML Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a single combined homelab YAML document entirely in the browser, from pasted text or a fetched URL.

**Architecture:** Add a browser loader that parses one YAML document and calls the existing schemas and domain validator. The app owns YAML text and source selection, so it no longer depends on the API or event stream; a URL fetch simply fills the same editor input.

**Tech Stack:** React, TypeScript, YAML, Zod, existing domain model and ELK graph.

**Spec:** `docs/superpowers/specs/2026-09-10-client-yaml-loading-design.md`

## Global Constraints

- Support one combined YAML document only; reject `imports`.
- Use Zod’s IP validator instead of Node’s `node:net` helper.
- URL loading uses browser fetch and surfaces CORS/network failures.
- Make the UI viewable before adding regression tests, at the user’s request.

---

### Task 1: Browser-safe domain validation

**Files:**
- Modify: `src/domain/validate.ts`
- Create: `src/client/load-yaml.ts`

**Interfaces:**
- Produces `loadYaml(source: string, file: string): DomainResult` for the client.

- [ ] Replace `node:net` address validation with `z.ipv4()` / `z.ipv6()` safe parsing.
- [ ] Parse one YAML document with `yaml.parseDocument`, emit current diagnostic shapes for syntax/schema failures, and reject non-empty `imports` with a `filesystem-import` diagnostic.
- [ ] Build the existing `SuccessfulLoadResult` shape in memory and call `validateDocuments`.

### Task 2: Client input and URL source controls

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `src/client/api.ts`
- Create: `src/client/example-yaml.ts`

**Interfaces:**
- Consumes `loadYaml(source, file)`.
- Produces the existing `HomelabModel` and diagnostics state for graph rendering.

- [ ] Bundle the combined example YAML as the initial editor value.
- [ ] Replace API/event-stream loading with local YAML parsing on an explicit Render action.
- [ ] Add a URL input and Load URL action that validates HTTP(S), fetches text, sets the editor, then renders it; retain editor text if fetch fails.
- [ ] Style the source controls as a compact, utilitarian panel above the topology and show errors beside the editor.
- [ ] Run the public-bound Vite UI for review before writing tests.

### Task 3: Regression coverage after UI review

**Files:**
- Create: `src/client/load-yaml.test.ts`
- Modify: `src/domain/validate.test.ts`

**Interfaces:**
- Exercises `loadYaml(source, file)` with the actual domain validator.

- [ ] Assert a valid combined YAML produces a model.
- [ ] Assert malformed YAML and schema errors produce diagnostics.
- [ ] Assert `imports` are rejected for browser input.
- [ ] Assert IPv4 and IPv6 are accepted and invalid addresses are rejected.
- [ ] Run focused tests, client typecheck, formatting, then the full test suite.
