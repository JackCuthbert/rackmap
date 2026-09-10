# SDD ledger — plan: docs/superpowers/plans/2026-09-09-unified-homelab-map.md

| Scope | Produces / consumes | Review finding |
| --- | --- | --- |
| Task 1 and Task 2 | Both consume `HomelabModel`; Task 1 changes only domain validation and Task 2 only derives client graph data. | No shared implementation files. |
| Task 2 and Task 3 | Task 2 produces `buildUnifiedGraph`; Task 3 consumes it in `App`. | Adapter contract precedes UI integration. |
| Task 3 and Task 4 | Task 3 changes the visible behavior that Task 4 documents. | Documentation follows final UI behavior. |

Ruling: Git metadata is unavailable, so this workspace cannot provide commit-based SDD review packages. Task reviews will inspect the affected files and run their narrow verification directly — this costs commit-range provenance but preserves behavioral review.
