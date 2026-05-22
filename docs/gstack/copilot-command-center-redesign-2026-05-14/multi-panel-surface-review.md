# Multi-Panel Surface Review — Copilot / Command Center

Date: 2026-05-14

Status: design correction after reviewing the pop-out panel reference image. Product/design only; no implementation has started.

## Correction

The previous panel-first correction was directionally right but too narrow. Peak Assistant should not be only a 320-420px right sidebar. The right sidebar is the daily home, but users also need larger pop-out panels for browsing many actions, configuring workflows, and reviewing richer results.

The key distinction:

- Wrong: build a standalone Command Center page that replaces Obsidian.
- Also wrong: force every action, catalog, and result into the narrow side panel.
- Better: use an Obsidian-native panel system with different panel sizes for different jobs.

## Reference Image Diagnosis

The referenced middle panel has useful properties:

- It appears above the current Obsidian workspace instead of replacing it.
- It has enough width for grouped action discovery.
- It can show Document and Vault action sections without feeling like a settings page.
- It preserves the sense that the user is still inside the current note.
- It offers a clearer operating surface than a narrow sidebar when the user needs to inspect many choices.

But the current style in the reference also exposes problems:

- Too many equal-weight cards make the user browse rather than decide.
- Duplicate actions such as `Suggest Links` and `Suggest Links (Graph)` compete as separate choices.
- Stars are visually prominent but do not explain why something is recommended.
- The selected/recommended card styling is not tied to current note evidence.
- There is no clear distinction between quick document actions, vault-wide jobs, and advanced/system actions.
- It lacks an obvious search/configure/review lifecycle.

## Revised Surface System

Peak Assistant should have four coordinated surfaces:

| Surface | Size | Primary job | Trigger | Should contain |
| --- | --- | --- | --- | --- |
| Quick Invoke | tiny | call one action immediately | command palette, hotkey, selection menu, toolbar | fuzzy action search, current scope |
| Docked Assistant Panel | narrow | ambient context and recommendations | right sidebar, ribbon, Ambient Push | current note, 2-3 suggestions, pending review |
| Pop-Out Command Panel | medium/large overlay | browse and configure many actions clearly | side panel "open", command palette, command center command | grouped actions, search, current scope, recommended reasons |
| Review / Apply Panel | focused overlay or drawer | inspect result artifacts and safely mutate notes | after action completes | candidates, provenance, diff, apply/ignore/undo |

The pop-out command panel is the missing middle layer. It lets the product operate many capabilities without turning into a separate app page.

## Pop-Out Command Panel Requirements

### Layout

- Opens above Obsidian with a dimmed or softened background.
- Keeps the current note title/path visible in a context strip.
- Uses a bounded overlay size, not a full-page route:
  - desktop target: 960-1180px wide, 72-84vh tall,
  - max width should leave Obsidian edges visible,
  - mobile/narrow desktop can become a full-height modal.
- Top area:
  - title: `Copilot` or `Peak Assistant`,
  - current note / selection / folder context,
  - search field for actions, skills, recent runs, and settings.
- Top tab navigation, matching the existing Search-view pattern:
  - `Document` for current note/selection work powered by Copilot,
  - `Vault` for Vault Intelligence Analyze/Synthesize/Maintain,
  - `Setting` for models, index, providers, skills, prompts, and diagnostics.
- Main area:
  - recommended actions first,
  - scoped command results second,
  - advanced/system actions visually separated.

### Card Behavior

Action cards should not be equal buttons. Each card needs:

- action name,
- short user-value description,
- scope badge: Selection, Note, Folder, Vault, Admin,
- mutation/risk badge: Preview, Diff, Safe, Review, Destructive,
- recommendation reason when starred/recommended,
- disabled reason when the current context does not fit.

Duplicate strategy variants should be merged:

- `Suggest Links` + `Suggest Links (Graph)` -> `Connect Related Notes`
- semantic/graph/backlink/agent become provenance badges after the run
- quick/deep modes can be configuration options, not separate top-level cards.

### State Model

The pop-out command panel is not just a static catalog. It should support:

1. browse/search,
2. configure scope,
3. start action,
4. hand off to running state,
5. hand off to review/apply panel.

It should be possible to return to the panel without losing the current note context.

## When To Use Each Surface

Use the docked side panel when:

- the user is writing,
- the product wants to suggest quietly,
- there are 2-3 obvious next actions,
- a run completed and needs lightweight review.

Use the pop-out command panel when:

- the user explicitly asks for Copilot / Command Center,
- the user wants to browse many actions,
- the action needs configuration before running,
- the current context has multiple plausible action families,
- the user needs to switch between Document, Vault, and Setting command domains.

Use the review/apply panel when:

- the action produced candidates,
- the action may change a note,
- provenance, diff, or batch selection is required,
- the user needs to inspect source notes before applying.

## Design Implication

The first implementation should not be "side panel only" and should not be "full page command center." It should define a shared panel shell system:

1. `AssistantDockPanel` for the right sidebar.
2. `CommandPopoutPanel` for action browsing/configuration.
3. `ActionReviewPanel` for results/diffs/apply.
4. Shared action cards, scope badges, risk badges, recommendation reasons, and lifecycle states.

The product promise becomes:

> Stay in Obsidian. Use the docked panel for awareness, pop out a larger panel when you need to operate many capabilities, and review every mutation before it touches the vault.
