# T11P Review-Fix — Implementation Note

Codex review packet `docs/superpowers/audits/2026-06-27-t11p-owner-review-packet.md`
flagged one remaining dynamic `UI -> app` escape hatch that the T11P guard did
not catch. This note records the targeted fix.

## Finding (recap)

`src/ui/view/quick-search/hooks/useGraphAgent.ts:72` dynamically reached into
`@/app/context/AppContext` to construct a `GraphAgent` from inside an async IIFE:

```ts
const { GraphAgent } = await import('@/service/agents/ai-graph/GraphAgent');
const { AppContext } = await import('@/app/context/AppContext');
const ctx = AppContext.getInstance();
…
const agent = new GraphAgent(ctx.app, ctx.plugin.manifest.id);
```

The T11P regression guard passed because it scanned selected files and selected
dynamic shims, not all `@/app/**` imports under `src/ui/**`.

## Fix

Followed the recommendation exactly — narrow, app-composed factory; no broadening
of QuickSearchHost into a raw `app` / `plugin` bag; no change to graph behavior
or fallback behavior.

1. **`src/app/quick-search/composeQuickSearchHost.ts`**
   Added `createGraphAgent: () => new GraphAgent(app, plugin.manifest.id)` next to the
   sibling agent factories that already close over `app` and `plugin.manifest.id`
   (`createAIGraphAgent`, `createVaultSearchAgent`, `createContinueAnalysisAgent`).

2. **`src/ui/view/quick-search/hooks/useQuickSearchHost.ts`**
   Added the new factory to the `QuickSearchHost` interface
   (`createGraphAgent(): GraphAgent`) with a JSDoc note pointing at this review-fix.
   Type-only `GraphAgent` import — UI never constructs it.

3. **`src/ui/view/quick-search/hooks/useGraphAgent.ts`**
   Removed both dynamic imports (`@/service/agents/ai-graph/GraphAgent` and
   `@/app/context/AppContext`). Replaced with `const agent = host.createGraphAgent();`.
   `host` is added to the `useCallback` deps so a remounted host instance is reflected.
   No behavior change: agent construction args, `generateGraph` invocation, step
   events, fallback path, persistence, and abort handling are untouched.

4. **`test/t11p-remaining-ui-app-tail-regression.test.ts`**
   Added a new assertion `testUiHasNoAppImportsStaticOrDynamic` that scans the
   entire `src/ui/**` tree for any occurrence of
   `from "@/app/…"` / `from '@/app/…'` / `import("@/app/…")` / `import('@/app/…')`.
   This is the global guard that would have caught the original miss.

## Before / After Evidence

| Metric | Before review-fix | After review-fix |
| --- | ---: | ---: |
| dynamic `src/ui/** -> @/app/**` imports | 1 | **0** |
| static `UI -> app` (boundary scanner) | 0 | **0** |
| `useServiceContext().app` consumers | 0 | **0** |
| `useServiceContext().plugin` consumers | 3 | **3** (unchanged) |
| Total flagged cross-layer edges | 47 | **47** |
| service -> app | 7 | **7** (unchanged) |
| service -> ui / core -> ui / core -> upstream | 0 | **0** (unchanged) |
| raw UI vault/editor matches | 5 | **5** (unchanged) |

Plugin consumer roster (unchanged at 3):

- `src/ui/view/SettingsView.tsx:35`
- `src/ui/view/usage-dashboard/screens/BudgetAlerts.tsx:460`
- `src/ui/view/modals/harness-onboarding/ReviewRecommendationStep.tsx:48`

## Verification

```bash
npm run build                                                                        # OK
npm run audit:boundary -- --out /tmp/t11p-review-fix-boundary.md                     # 47 findings
npm run test -- test/t11p-remaining-ui-app-tail-regression.test.ts                   # 13/13 PASS
npm run test -- test/t11o-app-shell-relocation-regression.test.ts                    # 10/10 PASS
npm run test -- test/t11n-ui-vault-port-regression.test.ts                           # 8/8 PASS
npm run test -- test/t11m-ui-app-boundary-regression.test.ts test/service-ui-boundary.test.ts  # 8/8 + 1/1 PASS
```

New T11P assertion output:

```text
PASS: uiHasNoAppImportsStaticOrDynamic (0 src/ui/** -> @/app/** imports)
```

## Scope Discipline

- QuickSearchHost was **not** broadened into a raw `app` / `plugin` bag — only one
  named factory (`createGraphAgent`) was added, mirroring the existing
  `createAIGraphAgent` / `createVaultSearchAgent` shape.
- Graph UI behavior, graph generation pipeline, abort handling, fallback path,
  and persistence are byte-for-byte unchanged at the call site.
- Command Gateway, Current Work State, Settings layout, Chat runtime, and scanner
  thresholds were not touched.
- Boundary scanner script (`scripts/audit/boundary-baseline.mjs`) is unchanged —
  the new guard lives in the T11P test, not in the scanner.
