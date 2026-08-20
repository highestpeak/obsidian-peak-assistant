# Vault Intelligence Mock to production exact port

## Reference contract

This task ports the existing interactive Mock instead of redesigning it. The
decision order is:

1. `docs/gstack/vault-intelligence-workspace-2026-08-12-v2/continuation-handoff.md`;
2. `docs/superpowers/specs/2026-08-15-vault-scan-follow-up-and-work-queue-contract.md`;
3. `docs/gstack/vault-intelligence-workspace-2026-08-12-v2/index.html`, its
   embedded CSS/JS, `vault-graph-cytoscape.*`, and referenced assets;
4. current production types, runtime and persistence boundaries.

The Mock owns the render tree, reading order, geometry, visible state and
interaction language. Production replaces only data and action adapters.

## Current-source difference matrix

### DOM and React structure

- Keep the three top-level destinations and routed Scan flow.
- Replace generic Overview object buttons with focusable inventory summaries
  and dedicated inspect popovers matching the Mock hierarchy.
- Restore the Mock reading order: inventory, Continue work, full-year recorded
  activity, then Knowledge Index readiness.
- Keep Map text and Proposal as explicit routes. Maintenance may share a modal
  frame, but each domain owns its evidence, grouping, actions and exit state.

### Layout

- Port the 80px header, 45px navigation, 1500px content frame, 28px gutters,
  34px actions, inventory strip, dense work rows and overlay widths.
- Preserve Mock flex/grid parents. Do not compensate with negative margins.
- At narrow host widths, allow an intentional horizontal workspace floor for
  dense evidence surfaces and a single-column fallback for ordinary cards.

### State and interaction

- One workspace state machine derives first setup, changes, running,
  recoverable and completed header states.
- Header trust information, inventory popovers and date-range popovers support
  pointer, keyboard, Escape and focus restoration.
- Overview calendar selection is shared with Activity routing.
- Task projections preserve one canonical owner-choice set; Proposal selection
  remains independent review state and never mutates files before Apply.

### Data and action contracts

- Expand object presentation from generic `count/detail` to typed breakdown,
  status, coverage and exact owner action metadata.
- Files use the real file-type inventory. Chats use canonical conversation
  records. Projects and Composer expose only durable dimensions currently
  available; unavailable distributions remain explicit instead of synthetic.
- Every Mock action maps to a runtime command or a disabled/unavailable state.
  User-file writes continue through Proposal -> source guard -> Apply ->
  re-index -> Verify.

### Host adaptation

- Keep all rules under `.peak-vault-intelligence-view`.
- Defend promised button geometry against the Obsidian reset with scoped
  `!important` dimensions and padding.
- Use Obsidian theme tokens only at the outer environment boundary; internal
  geometry and light reference colors remain owned by this workspace.

### Pure visual CSS

- Port Mock variables, borders, radii, type scale, shadows, density and state
  colors after structure and state are correct.
- Reuse `AtlasGraphCanvas` as the production Cytoscape implementation while
  matching the Mock canvas frame and graph chrome contract.

## Execution DAG

```text
current-source audit
  -> typed object presentation + header state
  -> inventory popovers + Overview reading order
  -> full-year activity selection/range
  -> maintenance/proposal render-tree convergence
  -> scoped Mock CSS port + host defense
  -> production-component harness
  -> structure/state/interaction assertions
  -> reference/current/overlay screenshots
  -> focused tests + build + owned commit
```

## Acceptance gates

1. Rendered DOM follows the Mock section order and component grouping.
2. First setup, changes, running, recoverable and completed have coherent
   header, route and primary-action states.
3. Pointer and keyboard tests cover inventory inspect, date range, Activity
   handoff, task grouping and Proposal selection.
4. The harness imports the real production component and real production CSS;
   no duplicate test UI is allowed.
5. Normal viewport evidence contains reference, current, normalized overlay or
   diff, and a manifest. Narrow-width checks cover overflow and hit targets.
6. Focused tests and production build pass. Real Obsidian-only behavior remains
   `INTERACTION NOT VERIFIED` unless a final CDP pass is available.

## Protected scope and commit boundary

Do not modify the existing dirty roadmap, product docs, Mock, audit assets or
landing-page files. Commit only task-owned Vault Intelligence production files,
focused tests, harness support where tracked, and this plan.

## Implementation result

- Overview now follows the Mock hierarchy: inventory strip, Continue work,
  calendar activity with evidence, then Knowledge Index.
- Inventory hover/focus cards use real file types and typed canonical object
  breakdowns. Missing Chat, Project and Composer taxonomies stay explicit.
- Header status, trust information, date presets, custom dates, Escape and
  focus restoration are production React state.
- Proposal review is a dedicated route. Runtime source-hash guard, selection,
  Apply and Verify actions remain unchanged.
- Maintenance tasks now retain one canonical decision set while rendering
  distinct relationship, document-split, lifecycle and recovery evidence
  structures.
- The real component and compiled production CSS render in the local harness.
  Reference, Production, overlay and diff were captured at 1512 by 982.

Verification completed:

- five focused model/runtime/render/standalone/button-reset tests;
- production build and bundle checks;
- browser assertions for inventory hover, header and range Escape/focus,
  range selection, navigation and scroll reset.

No Obsidian CDP listener was available. Real-host interaction acceptance is
therefore `INTERACTION NOT VERIFIED`; the harness does not upgrade that claim.
