# Panel-First Revision — Copilot / Command Center

Date: 2026-05-14

Status: corrected product direction after user feedback. This is product/design analysis only; no implementation has started.

## Why The Previous Direction Was Too Heavy

The previous workbench prototype treated Command Center as a large independent page. That is the wrong center of gravity for Peak Assistant.

Peak Assistant's real product boundary is Obsidian. The assistant should feel like a panel, palette, and review layer living inside the user's writing environment, not a separate app that asks the user to leave the note.

The user is usually already in one of these states:

- writing or reviewing the current note,
- selecting a paragraph and wanting a quick action,
- noticing a weak link, missing evidence, stale tag, or task,
- checking a small recommendation from Ambient Push,
- running a longer vault workflow only after a local trigger justifies it.

Therefore the product should not begin with a full-page dashboard. It should begin with a small, fast, contextual surface.

## First Principles

1. The note is the primary workspace.

   The assistant is a companion to the current note. It should preserve the user's place, cursor, selection, heading, and reading flow.

2. The panel is the default home.

   A right-side Obsidian panel can stay open, update with context, and hold lightweight recommendations without stealing focus.

3. Quick invocation beats browsing.

   The user should be able to call actions from a command palette, slash-style menu, editor context menu, ribbon, or panel shortcut. The action does not need to start from a dashboard.

4. Workflows unfold in stages.

   A complex action is not one screen. It moves from quick trigger -> scoped configuration -> running state -> result review -> preview/apply -> applied record.

5. Progressive disclosure protects attention.

   The panel should show 2-3 high-value recommendations first. Full catalogs, strategy controls, traces, and system tools stay behind search, advanced mode, or drilldown.

6. Trust is local and concrete.

   The assistant earns trust by showing source notes, affected text, proposed insertions, and diffs near the action, not by displaying agent internals.

## Corrected Surface Model

Peak Assistant should be composed of three connected surfaces:

| Surface | Role | When it appears | UX weight |
| --- | --- | --- | --- |
| Quick Invoke | Fast action entry | command palette, selected text, context menu, toolbar, panel shortcut | tiny |
| Obsidian Panel | Daily assistant home | right sidebar, docked panel, current note context | compact |
| Review Drilldown | Safe result review | after an action produces candidates, diffs, or saved-note artifacts | focused |

This means "Command Center" should not be a destination page. It should be the mental model behind a panel and router.

## Panel Information Architecture

The panel should fit in roughly a 320-420px Obsidian side pane.

Top structure:

- Current context: note name, selection state, folder/project, index health.
- Quick command input: search actions, skills, recent runs, settings.
- Recommended now: at most 2-3 actions, each with one reason.
- Small action groups:
  - Improve note
  - Connect knowledge
  - Add evidence
  - Review tasks
  - Maintain vault
- Recent / pending review: compact queue of unfinished results.

Hidden or secondary:

- full action catalog,
- provider/model diagnostics,
- raw agent traces,
- prompt audit,
- workflow automation,
- destructive vault maintenance.

## Multi-State Flow

### State A — Passive Panel

The user is writing. The panel quietly shows current note context and a few suggested actions.

Primary promise: "I can help with this note now, but I will not interrupt you."

### State B — Quick Action

The user invokes an action from selection, command palette, or a panel card.

Primary promise: "The action already knows its scope. You only adjust what matters."

Example:

- selection -> Improve selected paragraph,
- current note -> Connect related notes,
- folder -> Review project tasks,
- vault signal -> Open maintenance item.

### State C — Running

The action runs in the panel or a small drilldown. The trace is summarized, not dominant.

Primary promise: "You can continue working; I will surface a reviewable result."

### State D — Result Review

The output becomes cards, candidates, diffs, or a rendered Markdown artifact.

Primary promise: "You approve concrete changes, not raw AI text."

### State E — Apply / Save / Dismiss

The user applies selected changes, saves a suggestion, opens source notes, or dismisses it.

Primary promise: "Every mutation is previewed and recoverable."

## What To Remove From The Primary Direction

- A large standalone Command Center page as the default experience.
- Three-column workbench as the first screen.
- Equal-weight grids of 15+ actions.
- Persistent raw trace as a primary visual layer.
- Top-level strategy choices such as semantic vs graph vs agent.
- System/admin tools mixed into daily note actions.

These can exist as secondary views, but not as the product's front door.

## Product Planning Implication

Implementation should start from shared interaction primitives, not from a new page:

1. shared panel shell,
2. quick invoke router,
3. action lifecycle states,
4. result review components,
5. merged user-facing workflows,
6. only then optional expanded views for vault-wide jobs.

The first implementation slice should prove one compact loop:

Current note -> panel recommendation -> Connect Related Notes -> review link proposals -> preview/apply selected links.

If that loop feels natural inside Obsidian, the broader Command Center direction is valid. If it needs a full page to feel usable, the product has probably exposed too much at once.
