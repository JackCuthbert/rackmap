# Homelab Visualizer Handoff

## Current state

- Tooling, mise configuration, Zod schemas, generated JSON Schema, YAML import
  loader, initial semantic validation, Bun API/SSE reload service, and bundled
  split YAML example exist.
- A Vite client is running separately and loads the API example. It has search,
  details, React Flow nodes, and initial ELK layout support.
- The existing graph still reflects the superseded tabbed-view implementation;
  it is not yet the unified hierarchical design described in the updated spec.

## Next implementation work

1. Replace tabs and per-layer filtering with one graph adapter that renders all
   entities in four top-down horizontal layer bands.
2. Implement ELK layered `DOWN` layout with fixed layer order, then allow
   transient React Flow node dragging without persisting positions.
3. Reduce default edges to primary placement/dependency arrows; render peer
   network links as dashed unarrowed edges; expose secondary derived edges only
   for a selection.
4. Add selection path highlighting and dim unrelated nodes/edges.
5. Complete semantic validation cycle detection and compute-parent constraints,
   then expand authoring documentation and manual acceptance checks.
