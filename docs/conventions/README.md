# Project Conventions

Project-specific rules that aren't obvious from code. Each rule lives in its
own file. CLAUDE.md keeps only one-line summaries + pointers to here.

## Why this folder exists

`CLAUDE.md` is loaded into every agent's context. Stuffing detailed rules
there makes it bloat and pushes other useful context out. Convention files
here are fetched on demand when an agent works in a relevant area.

## How to add a new rule

1. One markdown file per rule, lowercase-with-dashes (e.g. `obsidian-css-defense.md`)
2. Each rule file MUST contain:
   - **TL;DR** — 1-2 sentences a reader sees first
   - **Why** — root cause / background
   - **Do** — correct usage with code examples
   - **Don't** — anti-patterns with code examples
   - **Checklist** — bullet checks when reviewing
3. Add a 1-line entry to `CLAUDE.md` → **Project Rules** section with link

## Current rules

| Rule | Topic | Status |
|---|---|---|
| [obsidian-css-defense.md](./obsidian-css-defense.md) | Defending plugin CSS against Obsidian's global `<button>` / `<input>` injections | ✅ enforced |
| [design-tokens.md](./design-tokens.md) | All colors / spacing / radius / typography come from `--pk-*` tokens; no inline hex; no Obsidian-var direct refs | ✅ enforced |
| [primitive-usage.md](./primitive-usage.md) | Pick primitives by intent not shape; decision tree + anti-patterns + mock→primitive map | ✅ enforced |
| [component-primitives.md](./component-primitives.md) | Catalog of `.pk-*` CSS primitives + React wrappers; scope discipline; mock→production token rename | ✅ enforced |
| [jsx-mock-fidelity.md](./jsx-mock-fidelity.md) | JSX structure must match mock HTML; no `{x ?? ''}` in flex (empty span pollutes height); audits must include structural diff not just CSS | ✅ enforced |
| [configurability.md](./configurability.md) | No inline i18n / regex / label maps / color or style configs in logic files; route through `templates/config/` or `core/constant.ts` | ✅ enforced |

## Conventions that live inline in CLAUDE.md

These are short enough to keep inline in `CLAUDE.md`'s **Code Conventions** section (not in **Project Rules**):
- No semantic HTML (`<h1-h6>`, `<p>`) — `<span>` + Tailwind
- Component extraction at ~8 lines
- `<Button>` primitive over raw `<button>` (one-liner that points at `primitive-usage.md`)
- The other one-liners about useCallback / arrow-code / getInstance / Templates / Agents / Streaming patterns

**Hard rule:** if a convention's explanation grows past ~3 lines or starts needing code examples, move it to a file here and replace the CLAUDE.md entry with a one-line pointer (rule title + 1-sentence what it's about + link). Do NOT inline detailed rules in CLAUDE.md — it ships in every agent's context window and bloat there costs every conversation. This rule has been violated in the past (2026-06-01) and the Project Rules entries were re-shrunk back to one-liners; don't undo that.
