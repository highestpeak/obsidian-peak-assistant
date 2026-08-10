# Result Graph Community — implementation plan

Date: 2026-08-10

## Dependency DAG

```text
config + evidence types
        |
        v
sparse analysis graph -> Louvain -> community metadata/fingerprint
        |                              |
        v                              v
SQLite projection             ResultSubgraph community envelope
                                       |
generated-output registry -> community + node explanation stores/AI ports
                                       |
                                       v
Vault Search/File Atlas adapters -> toolbar/preset -> Cytoscape hulls -> anchored interactive cards
                                       |
                                       v
tests/build -> plugin reload -> real Obsidian interaction evidence
```

## Work packages

1. Add the template-backed community-analysis/UI config and prompt templates, with typed compiled fallbacks.
2. Rebuild the structural input as a bounded sparse evidence graph. Correct semantic similarity direction; add IDF-weighted tags and TextRank terms; separate large-vault community computation from expensive centrality/hole work.
3. Extend community metadata and SQLite projection with descriptors, evidence counts, fingerprint, coverage, and analysis mode.
4. Extend `ResultSubgraphOutput` and its app adapter with node preview/signals/link counts and community summaries.
5. Register durable community and ordinary-node explanation snapshot/event outputs, then implement app-composed streaming AI ports with evidence fingerprints.
6. Add the Community preset while preserving the owner-approved toolbar: Constellation, Community, Links →, compact ↓, Folders, and Orbit.
7. Add Cytoscape compound hulls, community colors, edge routing, anchored hover cards, pointer corridor, Escape/focus, streaming and stale UI. Keep ordinary-node summary and incoming/outgoing/total visible beside AI output.
8. Enrich File Atlas neighborhood nodes from the canonical index row and pass the same node-explanation port used by Vault Search into the shared graph canvas.
9. Run focused tests, full build, real Obsidian CDP assertions, visible screenshot evidence, review the task-owned diff, and commit only owned files.

## Protected scope / skip rules

- Preserve pre-existing edits to roadmap, landing-page brief, gstack research, workflow-history research, and unrelated audits.
- Do not add Community clustering to File Atlas in this work. Align only the shared ordinary-node card evidence and explicit AI explanation behavior.
- Do not migrate historical community IDs or generate explanations during indexing.
- Do not add a new global Command Palette entry.
- Do not treat mock or static source inspection as real interaction acceptance.

## Verification commands

```bash
npm run test -- test/structural-algorithms.test.ts
npm run test -- test/search/resultSubgraph.test.ts
npm run test -- test/result-graph-canvas-toolbar.test.ts
npm run test -- test/graph-node-explanation.test.ts
npm run test -- test/file-atlas-owner-review-contract.test.ts
npm run test -- test/generated-output-registry.test.ts
npm run build
```

Then follow `docs/conventions/obsidian-real-ui-qa.md` with the current CDP port.
