# Topology-first layout design

## Goal

Make moderate homelab maps readable at rest. Preserve an immediate sense of
entity category while prioritising parent/child grouping, visible fan-out, and
minimal avoidable edge crossings.

## Layout model

Replace the independent per-band layouts and hardware-derived host lanes with
one graph-wide ELK layered layout. Locations, network devices, hardware,
virtual machines, and applications remain ordered from top to bottom through
ELK layer constraints, but ELK may order nodes horizontally using relationships
from the complete graph.

Layout edges run from logical parent to child even where the displayed edge has
the opposite semantic direction. The layout includes group hierarchy and
membership, network upstream and attachment, and compute `runsOn`
relationships. Application dependencies participate only where they do not
undermine the primary placement hierarchy. Declared physical connections do
not influence the default layout.

Sibling subtrees are ordered and spaced according to their full descendant
footprint. A parent with one child beside a parent with many children must keep
its child within the parent's horizontal region rather than crossing the
neighbouring subtree.

## Presentation and routing

Keep subtle full-width category backgrounds based on the final vertical extent
of each category. Give entity cards a persistent category-coloured accent and
type label so category remains identifiable even where a category spans more
than one internal ELK layer.

Show primary structural edges without requiring focus: group hierarchy and
membership, network upstream and attachment, and compute placement. Continue
to reveal incidental physical connections only when an endpoint is focused.
Selection still dims unrelated nodes and edges.

Give each visible edge a distinct connection point distributed across the
appropriate node side. Route structural parent/child edges vertically and use
outer gutters only for relationships that genuinely skip category layers.
Rendered arrow direction remains the domain relationship direction, regardless
of the layout edge direction.

## Implementation boundaries

Move graph construction for ELK and result-to-position mapping into pure layout
helpers outside `App.tsx`. `App` remains responsible for asynchronous layout,
React Flow state, selection, and fitting the viewport. The YAML schema and
domain model do not change.

Use the existing ELK dependency. Do not add a second engine or layout selector
in this change. The extracted layout interface should allow a legacy/topology
mode toggle later without changing configuration data.

## Failure handling

Preserve the current behaviour when ELK rejects or fails: retain the existing
map state and show the concise auto-layout error. Ignore stale asynchronous
results after a model change or effect cleanup.

## Testing

Add focused unit tests for layout graph construction and mapped positions. The
fixture will cover nested locations, a multi-level network, unequal sibling
fan-out, hardware attached to network devices, and multiple workloads per host.
Assertions will verify category ordering, distinct fan-out ports, visible
default structural edges, and non-interleaved sibling subtrees. Run affected
client tests, type checking, and linting before completion.
