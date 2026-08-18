# Vault Intelligence production parity rebuild

## 1. Source of truth

Implementation decisions are resolved in this order:

1. `docs/gstack/vault-intelligence-workspace-2026-08-12-v2/continuation-handoff.md`;
2. `docs/superpowers/specs/2026-08-15-vault-scan-follow-up-and-work-queue-contract.md`;
3. `docs/gstack/vault-intelligence-workspace-2026-08-12-v2/index.html` as the visual and interaction reference;
4. the 2026-08-13 final design package for details not superseded by the handoff.

The latest handoff wins where the older final package still mentions a top-level Runs page. Production keeps only `Overview / Vault map / Work queue`; Scan setup, progress and Completed are one continuous route.

## 2. Impact Contract

### Primary outcome

The real Obsidian workspace must preserve the confirmed visual hierarchy and causal product contract across every reachable Vault Intelligence state, not merely render a standalone shell.

### Required tracks

- all global and routed screens: Overview, Vault contents, Activity, Work queue, Scan setup, Run progress and Completed;
- honest loading, empty, unavailable, partial, interrupted, stale and failure states;
- a separate Scan-check model for the 19 deterministic checks, instead of using 11 maintenance task kinds as checkboxes;
- the six real follow-up action families: resume, inspect, AI run, owner decision, recovery/verification and user-file proposal;
- domain-specific maintenance surfaces for File Properties, Broken Links and Community Membership, plus explicit domain actions for the remaining task kinds;
- `current owner choice > current Peak suggestion > history/evidence` across title, explanation, counts and CTA;
- guarded proposal review with per-file source revision, diff/result representation, explicit Apply and re-index/verify boundaries;
- shared Cytoscape graph controls and below-graph context; no permanent right drawer;
- rendered visual QA in addition to source tests and build.

### Forbidden scope

- no top-level Runs, Files & index or standalone AI Review tab;
- no permanent right-side selection drawer;
- no synthetic production counts, fake progress, fake AI result or toast-only action;
- no one-size-fits-all maintenance renderer that changes only labels;
- no direct or silent Markdown/frontmatter write from Scan or suggestion generation;
- no claim of real-host acceptance without CDP/Obsidian evidence.

### Minimum acceptable delta

- all seven screens have intentional production layouts and truthful states;
- all 19 current deterministic checks appear under the four confirmed Setup groups;
- every Work queue CTA either executes a real transition/handoff or clearly explains why it is unavailable;
- the three fully specified maintenance domains no longer use the generic dropdown workspace;
- user-file choices cannot reach Verified without proposal review, source guard, Apply receipt and recheck;
- focused tests and production build pass;
- visual overlap/geometry checks cover normal and narrow workspace widths.

If these conditions are not met, the result remains a partial rebuild and must not be described as the final Vault Intelligence implementation.

## 3. Full surface audit

| Surface | Current production problem | Required rebuild |
| --- | --- | --- |
| Global shell | Shared Button/reset wins in real Obsidian; active tabs become filled blue pills | Fully scoped geometry and color rules; underline navigation; stable header and route-aware primary action |
| Overview inventory | Object cards collapse; all four route to Vault map; no truthful readiness or priority state | Four real inventory cards, owner-specific destinations where available, Continue work, What changed, Priority work, Index readiness and raw activity |
| Vault contents | Seven extensions only; no readiness denominator; file text collides | Full type inventory, readiness strip, selection/filter state and honest unavailable reasons |
| Knowledge graph | `Communities` is treated as a layout; graph has permanent right drawer | Shared `Constellation / Flow -> / down / Orbit`; graph selection context below the canvas; stable empty/loading/error states |
| Activity | Only latest file mtimes; no explicit record types, sessions or AI-state boundary | Recorded-activity-first workspace, date range and evidence list; session/theme controls only when backed by real records/routes |
| Work queue | Empty shell before Scan; counts collide; no owner guidance; no inline semantic zoom | Dense task rows, truthful filters/counts, guidance state, inline evidence and typed owner destinations |
| Scan setup | Severe overlap; 11 task kinds are misused as checks | Safe-Scan hero, baseline/readiness facts, three scope cards, 19 checks in four groups, Knowledge Index plan, routed AI operations and estimate |
| Run progress | Four generic cards; no object pipeline or dual progress | Overall and Index progress, frozen plan, current object/queue, per-operation usage, stop/resume, warnings and retained partial results |
| Completed | Generic disclosures and the same Work queue renderer | Compact completion summary, local-update receipt, partial results, continuous actionable rows and contextual run evidence |
| File Properties | Generic select rows; no canonical operations or combined diff | Batch/File projections, Accept/Reject/Edit, conflict/stale state, combined per-file diff, Apply and verify |
| Broken Links | No target/file/exact-reference hierarchy or source excerpt | Target default, File override and exact-reference decision state with domain repair outcomes and fresh detector verification |
| Community Membership | Old suggestion remains visually current after owner override | Suggested Community/File projections, symmetric accept/reject/no-community, owner-choice truth and suggestion history |
| Other maintenance domains | Same dropdown grammar for unrelated actions | Action-family registry plus domain verbs, evidence and exit conditions for connection, related notes, split, structure, hubs, lifecycle, unusual notes and unreadable files |
| Suggestion correction | Not implemented | Natural-language guidance, controlled recompute receipt, preserved owner decisions and reconfirmation state |
| Proposal / Apply / Verify | `Prepare review handoff` only changes task state | Durable proposal state, source guard, per-file result, explicit Apply, receipt, scoped re-index/recheck and reopen on failure |

## 4. Implementation DAG

```text
P0 audit + contract tests
  -> P1 truth model and config split
  -> P2 scoped visual shell
     -> P3 Overview + Vault contents + Activity
     -> P4 Setup + Progress + Completed
  -> P5 Work queue + action-family routing
     -> P6 Properties / Broken links / Community membership
     -> P7 remaining domain surfaces
  -> P8 Proposal Apply / Verify and recovery
  -> P9 rendered QA + real Obsidian QA + review + commit
```

## 5. Verification gates

1. Focused model/config/runtime tests after every truth-model change.
2. Production CSS contract tests must assert scoped button geometry and the absence of the forbidden drawer/layout names.
3. Production build must contain the distinctive Vault Intelligence selectors.
4. Render every route at normal and narrow widths; compare against the final Mock hierarchy and check text collision, overflow, focus and disabled states.
5. When Obsidian CDP is available: plugin-only reload, DOM/computed-geometry assertions, keyboard/pointer flows and final screenshots.
6. If CDP remains unavailable, retain `INTERACTION NOT VERIFIED`; do not upgrade static rendering to host acceptance.

## 6. Commit boundary

Only task-owned production files, focused tests and this plan belong in the rebuild commit. Existing uncommitted Mock, roadmap, documentation-site and landing-page files in the primary checkout remain untouched.

## 7. Execution result

### Implemented in this rebuild

- rebuilt the shared shell and every reachable production route: Overview, Vault contents, Activity, Work queue, Scan setup, Run progress, Completed and all 11 maintenance task workspaces;
- separated the 19 deterministic checks into the confirmed four Setup groups while keeping the 11 follow-up task kinds as owner work, not Scan controls;
- added truthful Index readiness, changed-since-baseline, run usage, receipts, file-type inventory and owner-surface routing;
- restored the confirmed Cytoscape map layouts and moved selection plus AI context below the graph;
- replaced the generic maintenance dropdown grammar with domain projections, evidence, verbs, next actions and exit conditions;
- persisted owner choice values and source revisions, preserved verified owner intent across rescans, rejected stale proposal choices and prevented a newly discovered item from inheriting an old bulk default silently;
- changed source-file outcomes to the explicit `needs-proposal` state. Saving a decision now records exactly that decision and never masquerades as a generated diff, Apply or verification.

### Capability floors kept explicit

- There is no registered Vault Intelligence proposal writer or durable per-file diff carrier in the current runtime. This rebuild therefore does not expose a fake Apply/Verify path for file-changing choices. A real writer, proposal artifact, receipt and scoped re-index/recheck remain a subsequent implementation track.
- Activity currently has trustworthy access to each file's latest local modification timestamp and Vault Intelligence receipts. Chat, Project and Composer event streams are not yet normalized into the same activity schema, so the screen states that coverage instead of synthesizing a full history.
- A task-scoped natural-language suggestion-correction runtime does not exist. Owner choices and current suggestions are kept separate, but controlled suggestion recomputation remains a subsequent implementation track.
- Real Obsidian interaction and computed-geometry acceptance requires an active CDP listener. Without it, the result remains `INTERACTION NOT VERIFIED` even when source contracts, focused tests and the production build pass.

### Contract verdict

This is a full production-surface and truth-model rebuild, but it remains a **partial final-capability implementation** under the Impact Contract until Proposal → Apply → receipt → re-index/verify, suggestion recomputation and real-host interaction verification are implemented. Those gaps are visible states, not hidden placeholders or simulated success.
