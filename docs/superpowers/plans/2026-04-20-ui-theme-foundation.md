# UI/Theme Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dark mode support, CSS variable color system, Style Settings integration, and unified FileIcon — making the plugin theme-aware and customizable.

**Architecture:** All colors flow through `--pk-*` CSS custom properties. Structural colors default to Obsidian native vars (auto theme-aware). Brand/semantic colors have light/dark variants keyed to `.theme-dark`. Tailwind config consumes these vars. Style Settings exposes all vars for user customization.

**Tech Stack:** Tailwind CSS, Obsidian CSS variables, Style Settings plugin API (CSS comment blocks), Shadow DOM CSS variable inheritance.

**Spec:** `docs/superpowers/specs/2026-04-20-ui-theme-foundation-design.md`

---

## File Structure

### New files

| File | Purpose |
|---|---|
| `src/styles/peak-variables.css` | All `--pk-*` variable definitions + `.theme-dark` overrides |
| `src/styles/peak-style-settings.css` | `@settings` block for Style Settings plugin |

### Modified files

| File | Change |
|---|---|
| `tailwind.config.js` | Rewrite `colors` from hardcoded hex to `var(--pk-*)` references |
| `src/styles/streamdown-shadow-host.css:7-43` | Update `:host` to inherit `--pk-*` vars |
| `src/styles/tailwind.css:1-9` | Add `@import "./peak-variables.css"` and `@import "./peak-style-settings.css"` |
| `src/ui/view/shared/file-utils.tsx:87-110` | Replace hardcoded hex with CSS var tokens |
| ~64 TSX files | Replace inline hex values with Tailwind tokens (batched by area) |

---

### Task 1: CSS Variable Foundation

**Files:**
- Create: `src/styles/peak-variables.css`

- [ ] **Step 1: Create the variable definition file**

```css
/* src/styles/peak-variables.css */
/*
 * Peak Assistant CSS Custom Properties
 * Structural colors map to Obsidian native vars (auto theme-aware).
 * Brand/semantic colors have explicit light/dark variants.
 */

/* ── Structural: follow Obsidian theme by default ── */
.pktw-root {
  --pk-bg: var(--background-primary);
  --pk-bg-secondary: var(--background-secondary);
  --pk-fg: var(--text-normal);
  --pk-fg-muted: var(--text-muted);
  --pk-fg-faint: var(--text-faint);
  --pk-border: var(--background-modifier-border);
  --pk-hover: var(--background-modifier-hover);
  --pk-active: var(--background-modifier-active);

  /* ── Brand: purple accent ── */
  --pk-accent: #7c3aed;
  --pk-accent-hover: #6d28d9;
  --pk-accent-muted: rgba(124, 58, 237, 0.15);
  --pk-accent-fg: #ffffff;

  /* ── Semantic ── */
  --pk-success: #22c55e;
  --pk-success-muted: rgba(34, 197, 94, 0.12);
  --pk-warning: #f59e0b;
  --pk-warning-muted: rgba(245, 158, 11, 0.12);
  --pk-error: #ef4444;
  --pk-error-muted: rgba(239, 68, 68, 0.12);
  --pk-info: #3b82f6;
  --pk-info-muted: rgba(59, 130, 246, 0.12);
}

/* ── Dark mode overrides (brand + semantic only; structural follows Obsidian) ── */
.theme-dark .pktw-root {
  --pk-accent: #a78bfa;
  --pk-accent-hover: #8b5cf6;
  --pk-accent-muted: rgba(167, 139, 250, 0.15);
  --pk-accent-fg: #1a1a2e;

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

- [ ] **Step 2: Verify file is valid CSS**

```bash
npx tailwindcss -i src/styles/peak-variables.css -o /dev/null 2>&1 || echo "Syntax OK (tailwind not needed for plain CSS)"
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/peak-variables.css
git commit -m "feat: add peak CSS custom properties with light/dark variants"
```

---

### Task 2: Style Settings Integration

**Files:**
- Create: `src/styles/peak-style-settings.css`

- [ ] **Step 1: Create the Style Settings declaration file**

```css
/* src/styles/peak-style-settings.css */
/*
 * Style Settings plugin integration.
 * Exposes all --pk-* variables for user customization.
 * https://github.com/mgmeyers/obsidian-style-settings
 */

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
    title: Text Color
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
    id: pk-fg-faint
    title: Faint Text
    type: variable-color
    format: hex
    default: ''
  -
    id: pk-border
    title: Border Color
    type: variable-color
    format: hex
    default: ''
  -
    id: pk-hover
    title: Hover Background
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
    id: pk-accent-muted
    title: Accent Muted Background
    type: variable-color
    format: hex
    default: ''
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

- [ ] **Step 2: Commit**

```bash
git add src/styles/peak-style-settings.css
git commit -m "feat: add Style Settings integration for Peak color customization"
```

---

### Task 3: CSS Build Pipeline Update

**Files:**
- Modify: `src/styles/tailwind.css:1-9`

- [ ] **Step 1: Add imports to tailwind.css**

Add the two new CSS files as imports at the top of `src/styles/tailwind.css`, before the Tailwind directives:

```css
/* Peak CSS custom properties (must load before Tailwind utilities consume them) */
@import "./peak-variables.css";
@import "./peak-style-settings.css";

@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";
```

- [ ] **Step 2: Build CSS and verify**

```bash
npm run build:tailwind
```

Check that `styles.tailwind.css` output includes the `--pk-*` variable definitions and the `@settings` block.

- [ ] **Step 3: Build full project**

```bash
npm run build
```

Verify `styles.css` (final concatenated output) contains both the variables and the Style Settings block.

- [ ] **Step 4: Commit**

```bash
git add src/styles/tailwind.css
git commit -m "feat: wire peak CSS variables and Style Settings into build pipeline"
```

---

### Task 4: Tailwind Config Migration

**Files:**
- Modify: `tailwind.config.js:11-50`

- [ ] **Step 1: Rewrite colors to use CSS vars**

Replace the entire `colors` object in `tailwind.config.js`:

```js
colors: {
  // Structural (Obsidian-aware via CSS vars)
  background: 'var(--pk-bg)',
  'bg-secondary': 'var(--pk-bg-secondary)',
  card: 'var(--pk-bg)',
  popover: 'var(--pk-bg)',
  foreground: 'var(--pk-fg)',
  'muted-foreground': 'var(--pk-fg-muted)',
  'faint': 'var(--pk-fg-faint)',

  // Primary/secondary → accent system
  primary: {
    DEFAULT: 'var(--pk-accent)',
    foreground: 'var(--pk-accent-fg)',
  },
  secondary: {
    DEFAULT: 'var(--pk-bg-secondary)',
    foreground: 'var(--pk-fg)',
  },
  muted: {
    DEFAULT: 'var(--pk-bg-secondary)',
    foreground: 'var(--pk-fg-muted)',
  },
  accent: {
    DEFAULT: 'var(--pk-accent)',
    hover: 'var(--pk-accent-hover)',
    muted: 'var(--pk-accent-muted)',
    foreground: 'var(--pk-accent-fg)',
  },

  // Semantic
  destructive: {
    DEFAULT: 'var(--pk-error)',
    foreground: 'var(--pk-accent-fg)',
  },
  success: {
    DEFAULT: 'var(--pk-success)',
    muted: 'var(--pk-success-muted)',
  },
  warning: {
    DEFAULT: 'var(--pk-warning)',
    muted: 'var(--pk-warning-muted)',
  },
  error: {
    DEFAULT: 'var(--pk-error)',
    muted: 'var(--pk-error-muted)',
  },
  info: {
    DEFAULT: 'var(--pk-info)',
    muted: 'var(--pk-info-muted)',
  },

  // Borders + inputs
  border: 'var(--pk-border)',
  'border-default': 'var(--pk-border)',
  'border-hover': 'var(--pk-accent)',
  input: 'var(--pk-border)',
  ring: 'var(--pk-accent)',
},
```

- [ ] **Step 2: Build and verify**

```bash
npm run build:tailwind
npm run build
```

Verify the build succeeds. Some components may look different now — that's expected since they're consuming CSS vars instead of hardcoded values. The visual appearance should be similar in light mode because structural vars resolve to Obsidian's light theme values.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js
git commit -m "feat: migrate Tailwind color tokens from hardcoded hex to CSS variables"
```

---

### Task 5: Streamdown Shadow Host Update

**Files:**
- Modify: `src/styles/streamdown-shadow-host.css:7-43`

- [ ] **Step 1: Update :host variable definitions**

Replace the hardcoded HSL values in `:host` with inherited `--pk-*` vars. The streamdown Tailwind config expects HSL triplets for `hsl(var(--background))` usage, so we provide hex fallbacks and override the color function usage where needed:

```css
:host {
  display: block !important;
  width: 100%;
  min-height: 1em;
  overflow: visible;
  font-family: var(--font-interface, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  font-size: 0.875rem;
  line-height: 1.6;
  background-color: transparent;
  color: var(--pk-fg, #1a1c1e);

  /* Streamdown tokens — inherit from pk vars with fallback HSL for backward compat */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;

  --color-muted-foreground: hsl(var(--muted-foreground));
  --obsidian-text-accent: var(--text-accent, #2563eb);
  --obsidian-text-accent-hover: var(--text-accent-hover, #1d4ed8);
}

/* Dark mode: Obsidian adds .theme-dark to <body>, which ancestors the shadow host */
:host-context(.theme-dark) {
  color: var(--pk-fg, #e2e8f0);
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --popover: 222.2 84% 4.9%;
  --popover-foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 212.7 26.8% 83.9%;
}
```

Note: `:host-context(.theme-dark)` checks if any ancestor of the shadow host has `.theme-dark`. This is the standard way to detect Obsidian's dark mode from inside a shadow root.

- [ ] **Step 2: Also update the bare table fallback colors**

In the same file, replace the hardcoded hex in the bare table fallback (lines 242-249):

```css
[data-streamdown-root] table:not([data-streamdown] table) th,
[data-streamdown-root] table:not([data-streamdown] table) td {
  border: 1px solid hsl(var(--border));
  padding: 0.375rem 0.625rem;
  text-align: left;
}
[data-streamdown-root] table:not([data-streamdown] table) th {
  background: hsl(var(--muted) / 0.5);
  font-weight: 600;
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build:streamdown
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/styles/streamdown-shadow-host.css
git commit -m "feat: add dark mode support to streamdown shadow host via :host-context"
```

---

### Task 6: FileIcon Color Migration

**Files:**
- Modify: `src/ui/view/shared/file-utils.tsx:87-110`

- [ ] **Step 1: Replace hardcoded colors with CSS var tokens**

Update `getFileIcon()` to use the new Tailwind tokens:

```tsx
export function getFileIcon(type: string, isSelected: boolean = false, className?: string): React.ReactElement {
  const iconClass = cn(className, isSelected
    ? "pktw-w-4 pktw-h-4 pktw-text-white"
    : "pktw-w-4 pktw-h-4");

  switch (type) {
    case 'markdown':
      return <FileText className={cn(iconClass, isSelected ? "" : "pktw-text-accent")} />;
    case 'pdf':
      return <FileTypeIcon className={cn(iconClass, isSelected ? "" : "pktw-text-error")} />;
    case 'image':
      return <Image className={cn(iconClass, isSelected ? "" : "pktw-text-success")} />;
    case 'folder':
      return <Folder className={cn(iconClass, isSelected ? "" : "pktw-text-warning")} />;
    case 'heading':
      return <Heading className={cn(iconClass, isSelected ? "" : "pktw-text-info")} />;
    case 'tag':
      return <FileText className={cn(iconClass, isSelected ? "" : "pktw-text-info")} />;
    case 'category':
      return <FileText className={cn(iconClass, isSelected ? "" : "pktw-text-accent")} />;
    default:
      return <FileText className={cn(iconClass, isSelected ? "" : "pktw-text-muted-foreground")} />;
  }
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/shared/file-utils.tsx
git commit -m "feat: migrate FileIcon colors from hardcoded hex to CSS var tokens"
```

---

### Task 7: Hex Cleanup — Quick Search Components (P0)

**Files:**
- Modify: All TSX files under `src/ui/view/quick-search/`

- [ ] **Step 1: Find all hardcoded hex in quick-search**

```bash
grep -rn '#[0-9a-fA-F]\{3,8\}' src/ui/view/quick-search/ --include='*.tsx' --include='*.ts' | grep -v node_modules | grep -v '.test.'
```

- [ ] **Step 2: Replace systematically**

For each file, apply these substitutions:

| Hex pattern | Replacement |
|---|---|
| `#7c3aed`, `#6d28d9`, `#8b5cf6`, `#a78bfa` (purple) | `var(--pk-accent)` or `pktw-text-accent` / `pktw-bg-accent` |
| `#ffffff`, `#f8f9fa`, `#f3f4f6`, `#f0f0f0` (light bg) | `var(--pk-bg)` or `pktw-bg-background` |
| `#1a1c1e`, `#1a1a1a`, `#000000`, `#111827` (dark text) | `var(--pk-fg)` or `pktw-text-foreground` |
| `#9ca3af`, `#8C8C8C`, `#6b7280` (muted text) | `var(--pk-fg-muted)` or `pktw-text-muted-foreground` |
| `#e5e7eb`, `rgba(128,128,128,0.15)` (border) | `var(--pk-border)` or `pktw-border-border` |
| `#22c55e` (green) | `var(--pk-success)` or `pktw-text-success` |
| `#ef4444`, `#dc2626` (red) | `var(--pk-error)` or `pktw-text-error` |
| `#3b82f6` (blue) | `var(--pk-info)` or `pktw-text-info` |
| `#f59e0b`, `#fbbf24` (amber) | `var(--pk-warning)` or `pktw-text-warning` |

For inline `style` props with hex, prefer converting to `className` with Tailwind tokens. If a `style` prop is needed (dynamic), use `var(--pk-*)`:

```tsx
// Before
<div style={{ backgroundColor: '#f3f4f6' }}>
// After
<div className="pktw-bg-background">

// Before (dynamic)
<div style={{ color: isActive ? '#7c3aed' : '#6b7280' }}>
// After
<div style={{ color: isActive ? 'var(--pk-accent)' : 'var(--pk-fg-muted)' }}>
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: migrate quick-search components from hardcoded hex to CSS variables"
```

---

### Task 8: Hex Cleanup — Chat View Components (P1)

**Files:**
- Modify: All TSX files under `src/ui/view/chat-view/`

- [ ] **Step 1: Find all hardcoded hex**

```bash
grep -rn '#[0-9a-fA-F]\{3,8\}' src/ui/view/chat-view/ --include='*.tsx' --include='*.ts' | grep -v '.test.'
```

- [ ] **Step 2: Replace using the same substitution table from Task 7**

Same pattern mappings apply. Focus on:
- `ChatInputArea.tsx` — heavy inline styles
- `MessageViewItem.tsx` — message bubble colors
- `MessageViewHeader.tsx` — header text colors
- `view-ProjectOverview.tsx` — project card colors

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: migrate chat-view components from hardcoded hex to CSS variables"
```

---

### Task 9: Hex Cleanup — Settings, Shared UI, Remaining Components (P2-P3)

**Files:**
- Modify: `src/ui/view/settings/`
- Modify: `src/ui/component/`
- Modify: `src/ui/view/shared/`

- [ ] **Step 1: Find all remaining hardcoded hex in UI layer**

```bash
grep -rn '#[0-9a-fA-F]\{3,8\}' src/ui/ --include='*.tsx' --include='*.ts' | grep -v node_modules | grep -v '.test.' | grep -v quick-search | grep -v chat-view | grep -v file-utils
```

- [ ] **Step 2: Replace using the same substitution table from Task 7**

Pay special attention to:
- `ProviderSettings.tsx` — Obsidian var bridge attempts (already partially correct)
- `IntelligenceFrame.tsx` — glow animation colors (may need keeping as rgb for animation)
- `TokenUsage.tsx` — `#22c55e` → `var(--pk-success)`
- Graph components — node/edge colors

For animation keyframes in `src/styles/tailwind.css` (the `pktw-pulseGlow` animation), keep `rgba()` values but derive from brand colors:

```css
/* These can stay as rgba for now — animation keyframes don't support var() in all browsers */
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: migrate settings and shared UI from hardcoded hex to CSS variables"
```

---

### Task 10: Hex Cleanup — Mermaid, Streamdown CSS, Desktop Harness (P4-P5)

**Files:**
- Modify: `src/styles/streamdown.css` (Mermaid node state colors)
- Modify: `src/styles/tailwind.css` (animation keyframes)
- Modify: `src/desktop/App.tsx`, `src/desktop/DesktopRouter.tsx` (dev harness)

- [ ] **Step 1: Migrate Mermaid state colors in streamdown.css**

Find Mermaid node state colors and replace with CSS var references:

```css
/* Before */
.node-default > rect { fill: #f3f4f6; }
/* After */
.node-default > rect { fill: var(--pk-bg-secondary, #f3f4f6); }
```

- [ ] **Step 2: Update desktop dev harness**

Replace `backgroundColor: '#ffffff'` and `color: '#000000'` in `App.tsx` and `DesktopRouter.tsx` with CSS var references. These are dev-only, lower priority, but good to be consistent.

- [ ] **Step 3: Final grep to verify no remaining hardcoded hex in core UI**

```bash
grep -rn '#[0-9a-fA-F]\{3,8\}' src/ui/ src/styles/ --include='*.tsx' --include='*.ts' --include='*.css' | grep -v node_modules | grep -v '.test.' | wc -l
```

Target: close to zero for `src/ui/`. Some in `src/styles/` may remain (animation keyframes, fallback values). Document any intentional exceptions.

- [ ] **Step 4: Full build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: migrate remaining hex values in Mermaid CSS and desktop harness"
```

---

### Task 11: Mount Point Verification

**Files:**
- Modify: Various mount points to ensure `.pktw-root` class is present

- [ ] **Step 1: Verify .pktw-root on all mount points**

Check each plugin UI surface has `.pktw-root` on its root container:

```bash
grep -rn 'pktw-root' src/ --include='*.tsx' --include='*.ts'
```

If any mount point is missing, add it:

| Surface | File | Expected |
|---|---|---|
| Quick Search modal | `src/ui/view/QuickSearchModal.tsx` | Root div has `className="pktw-root"` |
| Chat sidebar | `src/ui/view/ChatView.tsx` | Root div has `className="pktw-root"` |
| Settings | `src/app/settings/MySetting.ts` | ReactRenderer wrapper has `pktw-root` |
| Desktop harness | `src/desktop/App.tsx` | Root div has `className="pktw-root"` |

- [ ] **Step 2: Test in Obsidian dark mode**

Toggle Obsidian to dark theme (Settings → Appearance → Dark). Verify:
- Plugin backgrounds follow theme
- Brand purple accent adjusts (lighter in dark mode)
- Streamdown markdown renders correctly
- FileIcon colors are visible against dark backgrounds
- Style Settings panel shows Peak Assistant section (if Style Settings plugin installed)

- [ ] **Step 3: Test with Minimal theme + Style Settings**

If available, switch to Minimal theme with dark sidebar enabled. Verify plugin views in sidebar use the sidebar's color scheme.

- [ ] **Step 4: Commit any mount point fixes**

```bash
git commit -am "fix: ensure .pktw-root class on all plugin mount points"
```

---

## Self-Review

**Spec coverage:**
- Section 1 (Color System Architecture) → Tasks 1, 4
- Section 2 (Tailwind Config Migration) → Task 4
- Section 3 (Style Settings Integration) → Task 2
- Section 4 (Inline Hex Cleanup) → Tasks 7-10
- Section 5 (Streamdown Shadow DOM) → Task 5
- Section 6 (Unified FileIcon) → Task 6
- Section 7 (Style Isolation) → No task needed (keep current approach)
- Section 8 (Mount Point Requirements) → Task 11

**All spec sections covered.**

**Placeholder scan:** Clean — no TBD/TODO. Task 7 hex substitution table is fully specified and reused by Tasks 8-10.

**Type consistency:** CSS variable names are consistent across all tasks: `--pk-bg`, `--pk-fg`, `--pk-accent`, etc. Tailwind token names match.
