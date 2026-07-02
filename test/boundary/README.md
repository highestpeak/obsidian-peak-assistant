# Service-Layer Boundary Tests

Wave 1.A — T0 Boundary Baseline. This directory contains a repo-wide import-scan
guard for `src/service/**`. It complements the existing feature-specific source
guards (`ambient-source-guard.test.ts`, `copilot-action-runtime-source-guard.test.ts`,
etc.) with a unified baseline that covers the entire service layer.

## What the tests enforce

Three rules are checked against every `.ts` / `.tsx` file under `src/service/`:

| Rule | What it forbids | Why |
|------|----------------|-----|
| **A** | `import ... from 'obsidian'` or `from 'obsidian/*'` (type-only included) | Service layer must be framework-agnostic; Obsidian types must live behind ports in `src/core/ports/` or adapters in `src/app/platform/`. |
| **B** | Live `AppContext.getInstance()` call (comments and string literals stripped before check) | Service layer must not use the global service locator. Dependencies must be passed through constructors, ports, or RunEnvelope boundaries. |
| **C** | `from '@/app/...'` or `from '@/ui/...'` imports | Layering direction check. Service must not import from the app shell or UI layers — only from `@/core/` and other `@/service/` modules. |

The test compares the **current scan** against a locked **baseline snapshot**
(`service-layer-baseline.json`):

- **New violation** (in current scan but not in baseline) → **test fails**. CI blocks the PR.
- **Fixed violation** (in baseline but not in current scan) → **printed as a note**, test passes. The baseline should be shrunk in a follow-up PR.

## How to shrink the baseline (after fixing a violation)

1. Fix the violation in the source file (remove the forbidden import / call).
2. Run the test locally: `npm run test -- test/boundary/service-layer-boundaries.test.ts`
3. The output will print a `NOTE — Consider tightening the baseline` message listing the fixed entry.
4. Open `test/boundary/service-layer-baseline.json` and remove the entry from the appropriate rule array.
5. Re-run the test to confirm it still passes.
6. Commit both the source fix and the baseline JSON update in the same PR.

## How to add a legitimate exception

If a violation is intentional and cannot be removed (e.g., an incremental migration
in progress), follow these steps to make the exception explicit and reviewable:

1. Add a comment line **in the violating file**:
   ```ts
   // boundary-allow: ruleA <reason: brief justification>
   ```
   Use `ruleA`, `ruleB`, or `ruleC` to match the rule being exempted.

2. Add the relative file path (from repo root, e.g. `src/service/foo/bar.ts`)
   to the corresponding array in `test/boundary/service-layer-baseline.json`:
   ```json
   {
     "ruleA": ["src/service/foo/bar.ts"],
     "ruleB": [],
     "ruleC": []
   }
   ```

3. Run the test to confirm it passes.
4. Include both changes in the same PR. The PR description must explain why the
   exception is necessary and what the migration plan is for removing it.

## Running the tests

```bash
# Run only the boundary tests
npm run test -- test/boundary/service-layer-boundaries.test.ts

# Run all tests (boundary tests are included in the full suite)
npm run test
```
