# Execution Decisions Log — 2026-07-03 Full Backlog Sweep

Companion to `2026-07-03-full-backlog-execution-plan.md`. Records every judgment call made while executing without user intervention.

## Ground rules (from user)

- 不停下来问，需要判断就按 recommend 做
- 决策记这里，不打断
- Wave 0 → Wave 1 → ... 按 DAG 走

## Working sequence

Given single-session execution and finite context, take Wave 0 in this order (fastest to slowest, least risky first):

1. **A0** — pure doc, no code risk. Land first as warmup.
2. **E1** — pure doc. Same.
3. **B7** — pure code move (IndexService → IndexGraphPort). Mechanical.
4. **B6** — new file, no wiring. Additive.
5. **B4** — targeted change to harness dispatch. Bounded.
6. **B1** — most invasive (main.ts commands). Do after B7/B6 land.
7. **B3** — needs real backend registration; may end up as scaffolding + fixture strategies since exercising real API keys inside this session isn't feasible.

If any of B1/B3 turn out to have huge blast radius, land the scaffolding + a documented follow-up here rather than half-finished code.

## Decisions

_Decisions appended below as they happen._

