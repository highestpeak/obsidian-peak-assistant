# UI/Theme Foundation Design Spec

> **Date**: 2026-04-20
> **Status**: Approved
> **Scope**: Dark mode support, CSS variable color system, Style Settings integration, inline hex cleanup, FileIcon unification
> **Issues**: #92 (dark theme), #77 (style isolation), #56 (theme config), #74 (FileIcon)

---

## Problem

The plugin has no dark mode support. The color system is a three-tier mess: Tailwind tokens with hardcoded hex, streamdown CSS variables (light-only), and ~559 inline hex values across 64 TSX files. Obsidian themes like Minimal with per-area color schemes (dark sidebar + light content) are not supported. Users cannot customize plugin colors through Style Settings.

## Design

### 1. Color System Architecture

Three layers of CSS custom properties, all defined on `.pktw-root`:

| Layer | Variables | Default source | Style Settings configurable |
|---|---|---|---|
| Structural | `--pk-bg`, `--pk-bg-secondary`, `--pk-fg`, `--pk-fg-muted`, `--pk-fg-faint`, `--pk-border`, `--pk-hover`, `--pk-active` | Obsidian native vars (`var(--background-primary)`, etc.) | Yes (empty default = follow theme) |
| Brand | `--pk-accent`, `--pk-accent-hover`, `--pk-accent-muted`, `--pk-accent-fg` | Custom defaults, light/dark variants | Yes |
| Semantic | `--pk-success`, `--pk-warning`, `--pk-error`, `--pk-info` + muted variants | Custom defaults, light/dark variants | Yes |

#### Structural color defaults

```css
.pktw-root {
  --pk-bg: var(--background-primary);
  --pk-bg-secondary: var(--background-secondary);
  --pk-fg: var(--text-normal);
  --pk-fg-muted: var(--text-muted);
  --pk-fg-faint: var(--text-faint);
  --pk-border: var(--background-modifier-border);
  --pk-hover: var(--background-modifier-hover);
  --pk-active: var(--background-modifier-active);
}
```

By referencing Obsidian native vars directly, CSS cascade ensures correct per-area values. In Minimal theme with dark sidebar, a plugin view inside `.mod-left-split` inherits the sidebar's `--background-primary` (dark), while a modal inherits the body-level value. No JS theme detection needed.

When a user overrides via Style Settings, the Style Settings plugin injects a rule that replaces the Obsidian var reference with the user's chosen value. Unoverridden variables continue following the active Obsidian theme.

#### Brand color defaults (light/dark)

```css
.pktw-root {
  --pk-accent: #7c3aed;
  --pk-accent-hover: #6d28d9;
  --pk-accent-muted: rgba(124, 58, 237, 0.15);
  --pk-accent-fg: #ffffff;
}
.theme-dark .pktw-root {
  --pk-accent: #a78bfa;
  --pk-accent-hover: #8b5cf6;
  --pk-accent-muted: rgba(167, 139, 250, 0.15);
  --pk-accent-fg: #1a1a2e;
}
```

#### Semantic color defaults (light/dark)

```css
.pktw-root {
  --pk-success: #22c55e;
  --pk-success-muted: rgba(34, 197, 94, 0.12);
  --pk-warning: #f59e0b;
  --pk-warning-muted: rgba(245, 158, 11, 0.12);
  --pk-error: #ef4444;
  --pk-error-muted: rgba(239, 68, 68, 0.12);
  --pk-info: #3b82f6;
  --pk-info-muted: rgba(59, 130, 246, 0.12);
}
.theme-dark .pktw-root {
  --pk-success: #4ade80;
  --pk-success-muted: rgba(74, 222, 128, 0.12);
  --pk-warning: #fbbf24;
  --pk-warning-muted: rgba(251, 191, 36, 0.12);
  --pk-error: #f87171;
  --pk-error-muted: rgba(248, 113, 113, 0.12);
  --pk-info: #60a5fa;
  --pk-info-muted: rgba(96, 165, 250, 0.12);
}
```

### 2. Tailwind Config Migration

`tailwind.config.js` `theme.extend.colors` changes from hardcoded hex to CSS var references:

```js
// Before
colors: {
  background: '#282828',
  card: '#ffffff',
  foreground: '#8C8C8C',
  primary: { DEFAULT: '#3b82f6' },
  secondary: { DEFAULT: '#f3f4f6', foreground: '#1a1a1a' },
  border: 'rgba(128, 128, 128, 0.15)',
}

// After
colors: {
  background: 'var(--pk-bg)',
  'bg-secondary': 'var(--pk-bg-secondary)',
  foreground: 'var(--pk-fg)',
  muted: 'var(--pk-fg-muted)',
  faint: 'var(--pk-fg-faint)',
  border: 'var(--pk-border)',
  hover: 'var(--pk-hover)',
  active: 'var(--pk-active)',
  accent: {
    DEFAULT: 'var(--pk-accent)',
    hover: 'var(--pk-accent-hover)',
    muted: 'var(--pk-accent-muted)',
    fg: 'var(--pk-accent-fg)',
  },
  success: { DEFAULT: 'var(--pk-success)', muted: 'var(--pk-success-muted)' },
  warning: { DEFAULT: 'var(--pk-warning)', muted: 'var(--pk-warning-muted)' },
  error: { DEFAULT: 'var(--pk-error)', muted: 'var(--pk-error-muted)' },
  info: { DEFAULT: 'var(--pk-info)', muted: 'var(--pk-info-muted)' },
}
```

No `darkMode` config needed. Dark/light switching is handled entirely by CSS variable values on `.theme-dark .pktw-root`. Tailwind only consumes variables.

### 3. Style Settings Integration

A `@settings` CSS comment block is added to the plugin's main stylesheet, exposing all `--pk-*` variables:

```css
/* @settings
name: Peak Assistant
id: peak-assistant
settings:
  -
    id: pk-structural-heading
    title: Structural Colors
    type: heading
    level: 1
    description: Leave empty to follow your Obsidian theme
  -
    id: pk-bg
    title: Background
    type: variable-color
    format: hex
    default: ''
  -
    id: pk-bg-secondary
    title: Secondary Background
    type: variable-color
    format: hex
    default: ''
  -
    id: pk-fg
    title: Text
    type: variable-color
    format: hex
    default: ''
  -
    id: pk-fg-muted
    title: Muted Text
    type: variable-color
    format: hex
    default: ''
  -
    id: pk-border
    title: Border
    type: variable-color
    format: hex
    default: ''
  -
    id: pk-brand-heading
    title: Brand Colors
    type: heading
    level: 1
  -
    id: pk-accent
    title: Accent Color
    type: variable-color
    format: hex
    default: '#7c3aed'
  -
    id: pk-accent-hover
    title: Accent Hover
    type: variable-color
    format: hex
    default: '#6d28d9'
  -
    id: pk-semantic-heading
    title: Semantic Colors
    type: heading
    level: 1
  -
    id: pk-success
    title: Success
    type: variable-color
    format: hex
    default: '#22c55e'
  -
    id: pk-warning
    title: Warning
    type: variable-color
    format: hex
    default: '#f59e0b'
  -
    id: pk-error
    title: Error
    type: variable-color
    format: hex
    default: '#ef4444'
  -
    id: pk-info
    title: Info
    type: variable-color
    format: hex
    default: '#3b82f6'
*/
```

Empty default on structural colors means "no override, follow Obsidian theme." When the user picks a color, Style Settings injects a CSS rule that sets the variable directly, overriding the Obsidian var reference.

### 4. Inline Hex Cleanup

559 hardcoded hex values across 64 files, migrated in priority order:

| Priority | Scope | Est. count | Strategy |
|----------|-------|------------|----------|
| P0 | Quick Search modal components | ~80 | Replace with Tailwind tokens (`pktw-bg-background`, `pktw-text-foreground`, `pktw-text-accent`, etc.) |
| P1 | Chat view components | ~60 | Same |
| P2 | Settings components | ~40 | Same |
| P3 | Graph/Mermaid colors | ~30 | Migrate to `--pk-*` var references in CSS |
| P4 | Desktop dev harness | ~50 | Low priority, dev-only environment |
| P5 | Remaining scattered | ~300 | File-by-file cleanup |

Each file migration follows the same pattern:
1. Replace `#7c3aed` / `#6d28d9` / purple variants with `var(--pk-accent)` or Tailwind `pktw-text-accent`
2. Replace `#ffffff` / `#f3f4f6` / light bg variants with `var(--pk-bg)` or `pktw-bg-background`
3. Replace `#1a1c1e` / `#000000` / dark text with `var(--pk-fg)` or `pktw-text-foreground`
4. Replace `#e5e7eb` / `rgba(128, 128, 128, 0.15)` / border-ish values with `var(--pk-border)` or `pktw-border-border`
5. Replace `#22c55e` / `#ef4444` etc. with `var(--pk-success)` / `var(--pk-error)` or Tailwind `pktw-text-success`

### 5. Streamdown Shadow DOM

`src/styles/streamdown-shadow-host.css` `:host` variables change from hardcoded HSL to inherited `--pk-*` vars:

```css
/* Before */
:host {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --muted: 210 40% 96.1%;
  /* ... */
}

/* After */
:host {
  --background: var(--pk-bg, #ffffff);
  --foreground: var(--pk-fg, #1a1c1e);
  --muted: var(--pk-fg-muted, #6b7280);
  --muted-foreground: var(--pk-fg-faint, #9ca3af);
  --border: var(--pk-border, #e5e7eb);
  --accent: var(--pk-accent, #7c3aed);
  --accent-foreground: var(--pk-accent-fg, #ffffff);
}
```

CSS custom properties inherit through Shadow DOM boundaries from the host element's context. Since the host element sits inside `.pktw-root`, all `--pk-*` values are available.

Note: the streamdown Tailwind config (`tailwind.streamdown.config.js`) already uses `hsl(var(--background))` syntax. The `:host` block just needs to switch from static HSL to the `--pk-*` vars. If streamdown expects HSL triplets, a converter layer in `:host` may be needed:

```css
:host {
  /* If streamdown expects HSL triplets, define as a hex fallback + var override */
  --sd-bg-color: var(--pk-bg, #ffffff);
  color-scheme: light dark;
}
```

The exact mapping depends on whether streamdown's Tailwind config consumes raw hex or HSL triplets. This will be resolved during implementation.

### 6. Unified FileIcon Component

Extract `getFileIcon()` from `src/ui/view/shared/file-utils.tsx` into a standalone `<FileIcon>` component:

```tsx
// src/ui/component/shared-ui/FileIcon.tsx
interface FileIconProps {
  path: string;
  className?: string;
  size?: number; // default 16
}
```

Changes:
- All hardcoded icon colors (`#3b82f6`, `#8b5cf6`, etc.) replaced with `var(--pk-fg-muted)` for default icons and `var(--pk-accent)` for active/linked icons
- SVG `fill`/`stroke` use `currentColor` where possible, inheriting from parent text color
- Original `getFileIcon()` kept as a deprecated shim that calls `<FileIcon>` internally, or removed if all call sites can be updated
- Extension-to-icon mapping logic stays the same, just wrapped in a component

### 7. Style Isolation

**Current approach preserved:** `important: true` + `pktw-` prefix + Shadow DOM for streamdown + `preflight: false`.

**Recorded for future improvement:** Consider migrating to `important: '.pktw-root'` selector scoping to allow user CSS snippets to override plugin styles more easily. Current `important: true` does not conflict with the CSS variable approach or Style Settings integration because:
- CSS variables are set on `.pktw-root`, not on individual properties
- Style Settings injects variable overrides, not property overrides
- Tailwind utilities consume variables, so even with `!important`, the resolved value changes when the variable changes

### 8. Mount Point Requirements

Every plugin UI surface must be wrapped in a `.pktw-root` container for the CSS variables to be available:

| Surface | Current mount | Change needed |
|---|---|---|
| Quick Search modal | `QuickSearchModal.tsx` renders React root | Ensure `.pktw-root` wrapper on root element |
| Chat sidebar view | `ChatView.tsx` renders React root | Same |
| Settings tab | `MySetting.ts` renders `SettingsRoot` | Same |
| Notices | Obsidian `Notice` API | Cannot wrap — brand colors via inline var references |
| Desktop dev harness | `App.tsx` / `DesktopRouter.tsx` | Add `.pktw-root` wrapper |

## Non-Goals

- Custom theme creation/export UI
- Per-view color overrides (the CSS cascade handles per-area colors automatically)
- `darkMode` Tailwind config (unnecessary — CSS vars handle everything)
- Removing `important: true` (deferred — see Style Isolation section)
- Migrating streamdown's Tailwind config (it already uses CSS vars; only `:host` needs updating)

## Changes Summary

| File | Action |
|---|---|
| `src/styles/peak-variables.css` | **New** — all `--pk-*` variable definitions + `.theme-dark` overrides |
| `src/styles/peak-style-settings.css` | **New** — `@settings` block for Style Settings integration |
| `tailwind.config.js` | Rewrite `colors` to reference CSS vars |
| `src/styles/streamdown-shadow-host.css` | Update `:host` to inherit `--pk-*` vars |
| `src/ui/component/shared-ui/FileIcon.tsx` | **New** — unified FileIcon component |
| `src/ui/view/shared/file-utils.tsx` | Remove/deprecate `getFileIcon()` |
| ~64 TSX files | Replace hardcoded hex with Tailwind tokens or var references |
| CSS build pipeline | Include `peak-variables.css` and `peak-style-settings.css` in concatenation |
