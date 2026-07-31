# Keyboard Navigation Kernel Phase 1 — Implementation Note

**Status:** IMPLEMENTED / SOURCE + CONTRACT VERIFIED
**Source of truth:** `docs/superpowers/specs/2026-07-24-peak-keyboard-navigation-system.md`
**Scope:** Keyboard Kernel + Vault Search + AI Search + File Atlas + Chat Studio
**Protected scope:** Peak Composer and Composer Intelligence sidecar adapters are not connected in this phase.

## 1. Delivered boundary

The app layer now composes and owns one `PeakKeyboardRuntime` through
`AppRuntimeRegistry`. React surfaces receive only the
`PeakKeyboardNavigationPort`; no service-layer singleton or global main-window
listener was added.

Phase 1 delivers:

- per-`ownerDocument` surface and zone registration;
- `F6` / `Shift+F6` logical zone traversal with per-zone focus bookmarks;
- shared roving focus for list, tree, tablist, toolbar, and message composites;
- directional graph navigation plus a structured graph-node list;
- LIFO Escape layers with trigger restoration for mode/filter menus, the
  keyboard map, and the narrow Chat Studio drawer;
- IME and editor-first guards;
- a searchable, context-filtered keyboard map showing current Obsidian command
  bindings, conflicts, and unbound commands;
- stable Command Palette entry points for the four phase-1 surfaces, next /
  previous zone, last focus, and the keyboard map;
- owner-document-aware listeners and focus operations for detached windows.

## 2. Surface migration

### Vault Search

`Tab` no longer switches Vault Search and AI Search. It follows the normal
component order. Surface switching remains available from the Search tablist,
Obsidian commands, and the keyboard map. Results now expose one roving tab stop;
arrow keys move rows, `Enter` opens, `Cmd/Ctrl+Enter` opens a new tab, `Space`
selects, and `ArrowRight` opens the inspector.

### AI Search

The mode selector is a real menu with roving focus and Escape restoration.
Query, lifecycle, primary content, outline, and actions publish logical zones.
The input retains ownership of printable characters, arrows, and IME
composition; the existing `Alt+Up/Down` mode shortcut is limited to the mode
trigger.

### File Atlas

The file rail, view/filter controls, tree or graph, inspector, and non-empty
tray publish stable zones. File/tree/tray rows and tablists use roving focus.
Tree disclosure, selection, open, tray actions, splitter keys, graph spatial
navigation, and the graph-equivalent node list are keyboard reachable.

### Chat Studio

The left navigation, message timeline or centre content, Chat Composer, and
Conversation Index publish the CS1–CS4 order. Project/conversation/message/index
rows use composite focus. Message `Enter` enters content and `Escape` returns to
the message group. Narrow left drawer and manually collapsed right index restore
focus to their triggers. Splitters support fine and Shift-accelerated steps.

## 3. Phase 2 boundary

Composer remains intentionally absent from `PeakKeyboardSurfaceId`, runtime
commands, and surface registration. Phase 2 should start only after the existing
Composer sidecar work is committed, then add a Composer adapter against this
same app-owned runtime. It must not create a second keyboard runtime or duplicate
the shared roving / Escape primitives.

## 4. Verification boundary

- 18 focused kernel, surface, command-gateway, accessibility, Search, File
  Atlas, and Chat Studio test files pass.
- Production build, bundle syntax check, and simulator-boundary check pass.
- The full suite is 386 / 390. The four failures
  (`chat-studio-message-state-ui`, `code-block-theme-settings`,
  `composer-architecture-source-guards`, and
  `composer-frontmatter-inline-tag-candidate`) reproduce unchanged at the
  phase-1 base commit and are not caused by this task.
- The task-filtered TypeScript scan has no new errors. The remaining graph
  plugin declaration errors and `MessageViewItem` tool-call type error are
  existing repository-wide baseline failures.
- No Obsidian CDP listener was available for this run.

Until a real renderer run records focus order, active element, IME, popup,
drawer, graph, and detached-window evidence, the interaction status remains
`INTERACTION NOT VERIFIED`.
