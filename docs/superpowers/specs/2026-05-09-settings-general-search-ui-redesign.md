# Settings UI Redesign: General & Search Tabs

**Date:** 2026-05-09
**Status:** Approved

## Problem

The General and Search & Indexing settings tabs have inconsistent visual styles and suboptimal UX:
- General tab uses heavy collapsible groups (Folders / Behavior / Developer) for only 5 settings — unnecessary overhead
- Graph Visualization Tuning exposes 5 slider settings (`clusterForceStrength`, `nodeBaseRadiusPhysical`, `nodeBaseRadiusSemantic`, `nodeDegreeBoost`, `skeletonMinBranchNodes`) that are not consumed by any runtime code — dead settings
- Search tab uses a different visual pattern (icon+title sections) from General tab (collapsible panels)
- Document types grid is a rigid 4-column layout that doesn't adapt to width

## Design Decisions

| Question | Decision |
|----------|----------|
| Visual style | Modern card style — each setting is a rounded card with subtle hover effect |
| General tab grouping | No groups — flat list of cards, only 4 items |
| Search tab grouping | Lightweight section headers (uppercase label + icon), not collapsible |
| Graph Viz Tuning | Delete entirely — 5 sliders are dead code (no runtime consumer) |
| DevTools toggle | Keep, flat in General tab with "Developer" badge |
| Document types selector | Pill chips with flex wrap (replaces fixed 4-column grid) |

## General Tab

Flat list of 4 setting cards, no section headers needed:

1. **Data Storage Folder** — text input with confirm
2. **Chat Root Folder** — text input with confirm
3. **Attachment Handling** — dropdown select
4. **Enable DevTools Graph Inspector** — toggle switch, with `Developer` badge on label

### Removed
- `CollapsibleSettingsSection` usage (Folders / Behavior / Developer groups)
- Graph Visualization Tuning section (5 dead sliders + `<details>` accordion)

## Search & Indexing Tab

Three lightweight section headers with Lucide icons, each followed by setting cards:

### Indexing (Database icon)
1. **Auto-index on startup** — toggle
2. **Document types** — pill chips, flex-wrap layout. Active chips use accent color fill, inactive use muted gray. Clicking toggles inclusion.
3. **Ignore patterns** — button opens textarea editor

### Chunking (Scissors icon)
4. **Max chunk size** — number input with confirm
5. **Chunk overlap** — number input with confirm

### AI Analysis (Sparkles icon)
6. **Auto-save results** — toggle
7. **Save folder** — text input
8. **Recent history limit** — number input with confirm

## Visual Specification

### Setting Card
- Background: slightly elevated from tab background (e.g. `bg-[#2d2d2d]` on dark, `bg-white` on light)
- Border radius: 8px
- Padding: 14px 16px
- Gap between cards: 6px
- Hover: subtle brightness increase
- Layout: flex row, label+description on left, control on right
- For stacked content (e.g. doc type pills): flex column

### Section Header (Search tab only)
- Font: 11px uppercase, 600 weight, 1.2px letter spacing
- Color: muted (e.g. `text-[#777]`)
- Lucide icon: 14px, same muted color
- Padding: 16px top (8px for first), 8px bottom
- No background, no border — pure typography separator

### Pill Chips (Document Types)
- Border radius: 14px (full pill)
- Padding: 4px 12px
- Font: 12px
- Active: accent background with border, lighter accent text
- Inactive: gray background with subtle border, muted text
- Hover: slight brightness boost
- Layout: flex-wrap with 6px gap

### Badge (Developer label)
- Font: 10px, 500 weight
- Padding: 2px 6px
- Border radius: 4px
- Accent-tinted background, accent text
- Placed inline after setting label text

## Implementation Notes

### Files to modify
- `src/ui/view/settings/GeneralTab.tsx` — rewrite: remove `CollapsibleSettingsSection`, flat card list, delete Graph Viz section
- `src/ui/view/settings/SearchTab.tsx` — update: unify card style with General tab, replace `DocTypeGrid` with pill chips
- `src/ui/view/settings/component/DocTypeGrid.tsx` (or equivalent) — rewrite as pill chip component

### Files to clean up
- `src/app/settings/types.ts` — remove `graphViz.clusterForceStrength`, `nodeBaseRadiusPhysical`, `nodeBaseRadiusSemantic`, `nodeDegreeBoost`, `skeletonMinBranchNodes` from type and defaults
- `src/ui/component/shared-ui/CollapsibleSettingsSection.tsx` — check if used elsewhere; if only by GeneralTab, can be removed

### Shared components
- Extract a shared `SettingCard` component (both tabs currently define local `SettingRow` — deduplicate)
- Extract a shared `SectionHeader` component for Search tab's section titles

### Theme awareness
- Use Tailwind classes that respect Obsidian's light/dark theme rather than hardcoded hex colors
- The mockups show dark theme; implementation must work in both themes

## Mockups

Visual mockups available at:
- `.superpowers/brainstorm/21332-1778293900/content/full-mockup-general.html` (General tab)
- `.superpowers/brainstorm/21332-1778293900/content/full-mockup-search.html` (Search & Indexing tab)
