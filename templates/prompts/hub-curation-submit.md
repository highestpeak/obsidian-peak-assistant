Submit your current hub plan as one JSON object matching the `HubCurationSubmit` schema.

Fields:
- `hubs`: array of decisions (max 30). Each decision has `nodeId`, `hubPath`, `action` (`create`|`keep`|`merge`|`retire`), `scope.communityIds` (max 3), `scope.memberNodeIds` (max 60), `reason`. For `action='merge'`, also include `mergeSourceHubs` listing the paths of hubs being folded in.
- `coverage.totalMembers`: how many meaningful vault nodes you consider in scope of hub coverage (typically all `document`-type nodes with PageRank above a small threshold; not literally every file).
- `coverage.coveredMembers`: how many of those are inside at least one `create`/`keep`/`merge` decision's `scope.memberNodeIds`.
- `coverage.uncoveredHighValue`: up to 20 nodeIds that are high-signal but not covered. Empty is fine.
- `confidence`: your subjective 0..1 on the quality of this plan (not the coverage number).
- `should_stop`: `true` when further iterations would not materially change the plan.

Return only the JSON object, no prose, no code fences.
