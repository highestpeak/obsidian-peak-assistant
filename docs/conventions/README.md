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
| [ui-design.md](./ui-design.md) | The single design-system reference — tokens, primitive catalog, primitive usage decisions, Obsidian CSS defense, JSX-mock fidelity. 5 sections with section anchors. | ✅ enforced |
| [configurability.md](./configurability.md) | No inline i18n / regex / label maps / color or style configs in logic files; route through `templates/config/` or `core/constant.ts` | ✅ enforced |
| [root-docs.md](./root-docs.md) | Root `docs/*.html` pages are final-state manuals, not work logs; includes rules for status language, dense tables, long paths, Mermaid, formulas, and viewport QA. | ✅ enforced |
| [spec-and-tests.md](./spec-and-tests.md) | Spec / design doc 与其 acceptance criteria / test 文件清单 / bad-case 复现都写在同一份文档，不拆到独立的 test-plan.md / verification.md / qa.md。 | ✅ enforced |

**On why design rules consolidated into one file (2026-06-01):** the five earlier files (`design-tokens.md`, `component-primitives.md`, `primitive-usage.md`, `obsidian-css-defense.md`, `jsx-mock-fidelity.md`) were all design-system-stack content cross-linking each other every other paragraph. Splitting them made "which file do I open?" a cognitive tax and forced contributors to chase pointers between files. Merged into `ui-design.md` with section anchors (`#1-design-tokens`, `#2-component-primitives-catalog`, etc.) so a reader can grep within one file or jump to a specific section. Each old file's full content is preserved as a section.

## Conventions that live inline in CLAUDE.md

These are short enough to keep inline in `CLAUDE.md`'s **Code Conventions** section (not in **Project Rules**):
- No semantic HTML (`<h1-h6>`, `<p>`) — `<span>` + Tailwind
- Component extraction at ~8 lines
- `<Button>` primitive over raw `<button>` (one-liner that points at `primitive-usage.md`)
- The other one-liners about useCallback / arrow-code / getInstance / Templates / Agents / Streaming patterns

**Hard rule:** if a convention's explanation grows past ~3 lines or starts needing code examples, move it to a file here and replace the CLAUDE.md entry with a one-line pointer (rule title + 1-sentence what it's about + link). Do NOT inline detailed rules in CLAUDE.md — it ships in every agent's context window and bloat there costs every conversation. This rule has been violated in the past (2026-06-01) and the Project Rules entries were re-shrunk back to one-liners; don't undo that.
