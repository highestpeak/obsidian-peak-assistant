# Architecture Scorecard

This scorecard tracks whether the modernization is making Peak Assistant more elegant, modular, testable, and controllable. It is not a vanity metric. Scores must cite code, tests, or deleted old paths.

## Scoring Rubric

Use 0-100. Avoid false precision; increments of 5 or 10 are usually enough.

| Dimension | 0-30 | 40-60 | 70-85 | 90-100 |
| --- | --- | --- | --- | --- |
| Architecture clarity | Flow is implicit, scattered, or only known by reading UI/service internals | Main path can be traced but ownership is mixed | Runtime path and key contracts are clear for one capability | New engineer can trace entry -> run -> artifact -> surface quickly |
| Modularity | Large services own unrelated behavior and direct dependencies | Some boundaries exist but are bypassed | Clear contracts and ports for the changed area | Small capability slices can evolve independently |
| Single runtime path | Old and new implementations both own behavior | Facade exists but old logic remains meaningful | Old path is deleted or thin forwarding for one capability | All migrated entries converge on one runtime path |
| State ownership clarity | UI store / service / DB all act as truth | Truth can be inferred but is not enforced | One state owner, UI consumes projections | State lifecycle is explicit, tested, and traceable |
| Testability / fake-port readiness | Requires Obsidian/manual testing for basic confidence | Unit tests exist but real boundaries are hard to fake | Fake ports or fixtures prove the changed behavior | Golden trace / conformance tests cover backend, ports, artifacts |
| Old-path deletion | Nothing deleted; abstractions added on top | Some references removed, old behavior still live | Old path deleted or downgraded to thin forwarding | Deletion gate is enforced by tests or import guards |

## Overall Elegance Formula

Default weights:

```text
Architecture clarity: 20%
Modularity: 20%
Single runtime path: 20%
State ownership clarity: 15%
Testability / fake-port readiness: 15%
Old-path deletion: 10%
```

When a task is purely diagnostic, do not inflate scores for implementation dimensions. Use "baseline only" and score confidence separately.

## Progress Ledger

| Date | Task | Commit | Architecture clarity | Modularity | Single runtime path | State ownership | Testability | Old-path deletion | Overall | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-06-12 | Pre-refactor checkpoint | `4fa5bd2` | baseline | baseline | baseline | baseline | baseline | baseline | baseline | Tagged as `pre-large-refactor-2026-06-11`. No score yet; scoring starts with T0. |

## Evidence Rules

Every score update must include at least one of:

- File path and function/type/contract changed.
- Test file or fixture added.
- `rg` evidence that an old path reference was removed.
- Build/test command output.
- Explicit reason that a score did not improve.

## Common Score Smells

- Score improves because new abstractions were added, but no old path was removed.
- Modularity score improves while imports still cross the same boundary.
- State ownership score improves while UI store still owns long-running task truth.
- Testability score improves without fake ports, fixtures, or contract tests.
- Overall score improves despite a larger blast radius and no deletion.

## Owner Control Questions

Before accepting a higher score, the user should be able to answer:

1. Where do I start reading this capability?
2. What owns runtime state?
3. What file would I fake in tests?
4. What old path no longer matters?
5. What changed radius got smaller?
