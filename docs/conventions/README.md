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

## Conventions that live inline in CLAUDE.md

These are short enough to keep in `CLAUDE.md` without bloating it:
- shadcn `Button` over raw `<button>`
- No semantic HTML (`<h1-h6>`, `<p>`) — `<span>` + Tailwind
- Component extraction at ~8 lines
- Configurability via `templates/config/` or `core/constant.ts` (4 surface configs registered: `onboarding`, `settings`, `chat`, `dashboard` — PR-0 scaffold, 2026-05-30)

If a convention's explanation grows past ~3 lines, move it here.
