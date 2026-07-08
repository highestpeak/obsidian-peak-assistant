# Root Documentation

## TL;DR

Root `docs/*.html` pages are final-state manuals, not work logs. They should
help a maintainer or user understand the current product shape quickly:
responsibility, behavior, source of truth, data flow, formulas, and failure
cases.

## Why

The root docs are the entry point from `docs/index.html`. Readers use them to
build a stable mental model of Peak Assistant. If these pages mix current
behavior with branch notes, dated rollout summaries, proof badges, or roadmap
labels, the reader has to reverse-engineer what is real today.

Progress tracking belongs in `docs/progress.md`, `docs/roadmap.html`, specs,
or plans. Feature and infra pages should describe the durable system.

## Do

### Write final-state behavior

Explain what exists now:

- who owns the runtime;
- which settings or folders are the source of truth;
- what the user sees;
- what the maintainer changes first;
- what happens on failure or fallback.

Good:

```html
<p class="prose">
  DataStore lives under <code>ChatFolder/DataStore/</code> by default.
  Search always excludes the current <code>dataStorageFolder/</code> so
  SQLite files never enter the index.
</p>
```

### Put formulas next to worked examples

For scoring, ranking, trigger rules, health scores, compaction, or budgets,
include:

- the formula;
- realistic input;
- intermediate values;
- final score/rank/decision;
- two or three bad cases and how to tune or debug them.

This applies especially to Search, Vault Intelligence, Ambient Push, Usage
Budget, and Agent Context.

### Prefer readable structures over dense tables

Use a table only when cells stay short and columns compare like with like.
When any column becomes prose-heavy, use stacked sections, cards, path trees,
or a worked example.

Good table columns name concrete reader decisions:

- `Setting`
- `Default`
- `Who changes it`
- `Runtime effect`

Avoid vague columns like:

- `为什么`
- `详细文档`
- `关键证据`
- `开始前确认`
- `第 1 处`
- `第 2 处`

### Keep code paths scannable

In the reading path, show the short owner-facing label first. Put the full path
behind `data-copy` or in a compact reference list.

Good:

```html
<code data-copy="src/core/config/folderPaths.ts">folderPaths.ts</code>
```

Use path trees for folder models. They are usually easier to scan than tables.

### Draw diagrams at the right granularity

Mermaid nodes should carry categories or stable concepts. If detail does not
fit inside the node, move it under the figure.

Avoid node labels ending in `...`. A reader cannot know what was omitted.

All Mermaid figures must render before the doc is considered complete. A
visible `Syntax error` marker is a failing doc build, not an acceptable
placeholder.

### Make layouts readable before shipping

For pages with field lists, wide tables, Mermaid, or recipe grids, capture at
least the primary desktop/editor viewport. Fix:

- label columns crushing value text;
- recipe cards squeezed into multi-column grids;
- table columns where short labels get too much width and long conditions get
  too little;
- long paths wrapping every few characters;
- Mermaid overflow or syntax errors.

## Don't

### Do not turn final docs into status logs

Avoid process/status vocabulary in feature and infra docs:

```html
<!-- Wrong in final-state docs -->
<strong>已落地 vs 路线图</strong>
<span>2026-07-02 branch tail</span>
<span>shipped</span>
<span>planned</span>
<span>spec-only</span>
<span>已在代码中确认</span>
```

Allowed exceptions:

- `docs/roadmap.html`
- `docs/progress.md`
- dated specs and plans
- a small historical note that changes how the current system must be operated

### Do not expose obsolete defaults as supported behavior

When a default is retired, final docs should describe the new default only.
If persisted legacy values are normalized by code, say that as a current
loader behavior, not as a compatibility path users should rely on.

### Do not make every cross-reference a number

Write links on the named concept:

```html
<a href="12-feature-search.html">Hyper Search</a>
```

Avoid copy like `Search 看 12` unless it appears in a compact index where the
number itself is meaningful.

## Checklist

Before shipping a root docs batch:

- [ ] No `已落地`, `已发货`, `规划中`, `planned`, `shipped`, `spec-only`, `current draft`, or dated branch/task notes in final-state pages unless explicitly justified.
- [ ] `roadmap.html`, `progress.md`, specs, and plans are the only normal homes for status language.
- [ ] No obsolete defaults such as `_prompts`, `_skills`, `_inbox`, or `A-control/PeakAssistant/DataStore` appear as supported root-doc behavior.
- [ ] Dense tables have been converted to stacked sections when cells contain prose.
- [ ] Long paths use short visible labels plus `data-copy` or a reference list.
- [ ] Formula-heavy features include at least one worked example and bad cases.
- [ ] Mermaid diagrams render and contain no `Syntax error` marker.
- [ ] Primary viewport screenshots were checked for pages with layout risk.
