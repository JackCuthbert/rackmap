# Primary topology layout design

## Goal

Render moderate homelabs compactly, without overlapping nodes or avoidable direct-child edge crossings, while retaining compact location context.

## Primary layout

Replace global ELK positioning plus coordinate post-processing with a deterministic, bottom-up topology layout. The primary tree is:

```
network upstream → attached hardware → virtual machines → applications
```

A node's required width is the combined width of its primary child subtrees. Siblings are placed left-to-right in that allocated width, so unrelated subtrees do not interleave. Network devices use reversed displayed upstream relationships for parent-to-child layout. Hardware attaches to its declared network device. VMs attach to their `runsOn` hardware parent; applications attach to their `runsOn` VM parent.

Application children are laid out as grids of at most five columns. Their calculated grid width and height contribute to the VM's subtree dimensions before any parent is positioned. Consequently, a ten-container VM reserves a 5×2 footprint rather than a ten-card row.

## Secondary context

Locations are not primary topology parents. Groups are placed compactly in a top strip, ordered by parent relationship, and every non-group card retains its location badge. Location membership edges remain contextual and must not influence topology coordinates.

Hardware without a network attachment, such as a UPS, appears in a compact trailing hardware area. Declared USB, power, and PoE connections remain focus-only. Power and PoE are directional provider-to-consumer links; USB remains undirected.

## Rendering

Category backgrounds are calculated from the final node bounds. The order remains Locations, Network, Hardware, Virtualisation, Applications. Nodes never overlap; category frames do not overlap. Direct primary relationships run vertically between corresponding subtree regions. Cross-category contextual edges use existing gutter routing.

## Implementation

Replace `separateCategoryLayers` with pure deterministic layout helpers. Remove coordinate compaction and the global ELK request from `App`. Preserve the existing YAML schema, graph selection, cards, handles, and semantic arrow direction.

## Testing

Add layout fixtures covering:

- compact group strip with a location/network membership mismatch;
- unequal network/hardware/VM subtrees;
- ten applications under one VM rendered as a 5×2 grid;
- a second VM immediately following that grid without an empty reserved gap;
- an unconnected UPS in the hardware area;
- non-overlapping final rectangles and stable parent-before-child category ordering.
