# T11P Review-Fix Owner Review Packet

Status: **Accepted**

Reviewed commits:

```text
edeec92c fix(t11p): close last dynamic UI->app escape hatch in useGraphAgent
9f27a089 docs(t11p): add review-fix implementation note for useGraphAgent
```

## Verdict

T11P is now accepted as the UI/app tail closure wave.

The review-fix removed the last dynamic `src/ui/** -> @/app/**` escape hatch and strengthened the T11P guard so this class of miss should not recur.

## What Changed

The previous blocker was:

```text
src/ui/view/quick-search/hooks/useGraphAgent.ts
  await import('@/app/context/AppContext')
```

The fix routes GraphAgent construction through the existing app-composed Quick Search host:

```text
src/app/quick-search/composeQuickSearchHost.ts
  createGraphAgent: () => new GraphAgent(app, plugin.manifest.id)

src/ui/view/quick-search/hooks/useGraphAgent.ts
  const agent = host.createGraphAgent()
```

This keeps raw `app` and `plugin.manifest.id` inside the app composition layer while the UI consumes a named host operation.

## Final Metrics

| Metric | Final | Status |
| --- | ---: | --- |
| total flagged | 47 | accepted |
| static `UI -> app` | 0 | accepted |
| dynamic `src/ui/** -> @/app/**` | 0 | accepted |
| `useServiceContext().app` consumers | 0 | accepted |
| `useServiceContext().plugin` consumers | 3 | not inflated |
| service -> app | 7 | held |
| service -> ui | 0 | held |
| core -> ui | 0 | held |
| core -> upstream | 0 | held |
| raw UI vault/editor matches | 5 | improved from T11P baseline |

## Codex Verification

Commands run by Codex:

```bash
npm run build
npm run audit:boundary -- --out /tmp/t11p-review-fix-codex-boundary.md
npm run test -- test/t11p-remaining-ui-app-tail-regression.test.ts
npm run test -- test/t11o-app-shell-relocation-regression.test.ts
npm run test -- test/t11n-ui-vault-port-regression.test.ts
npm run test -- test/t11m-ui-app-boundary-regression.test.ts test/service-ui-boundary.test.ts
rg -n "from ['\"]@/app|import\\(['\"]@/app" src/ui -g '*.ts' -g '*.tsx'
```

Observed:

```text
build: PASS
audit:boundary: 47 findings
T11P guard: 13/13 PASS
T11O guard: 10/10 PASS
T11N guard: 8/8 PASS
T11M guard: 8/8 PASS
service-ui guard: 1/1 PASS
src/ui static/dynamic @/app imports: 0
```

The new T11P guard includes:

```text
PASS: uiHasNoAppImportsStaticOrDynamic (0 src/ui/** -> @/app/** imports)
```

## Owner Reading Guide

Read these files in order:

1. `src/ui/view/quick-search/hooks/useGraphAgent.ts`
   - Confirms the UI hook now calls `host.createGraphAgent()` instead of dynamically importing `AppContext`.
2. `src/ui/view/quick-search/hooks/useQuickSearchHost.ts`
   - Shows `createGraphAgent()` added as a named Quick Search host operation.
3. `src/app/quick-search/composeQuickSearchHost.ts`
   - Shows raw `app` / `plugin.manifest.id` are closed over in app composition.
4. `test/t11p-remaining-ui-app-tail-regression.test.ts`
   - Shows the new global static/dynamic `@/app/**` import guard.
5. `docs/superpowers/refactor-ops/t11p-review-fix-note.md`
   - Claude's implementation note for the targeted fix.

## Remaining Caveats

T11P closes the UI/app tail, but it does not mean the whole modernization is complete.

Still not part of T11P:

- Command Gateway remains T12 capstone.
- Current Work State remains post-foundation.
- The remaining `service -> app = 7` is still a future boundary-retirement candidate.
- `useServiceContext().plugin = 3` is intentionally held, not expanded; future work can decide whether those three consumers deserve narrow ports.

## Acceptance

Accepted after review-fix.

T11P can now be recorded as:

```text
UI/app tail closure complete:
static UI -> app = 0
dynamic src/ui/** -> @/app/** = 0
useServiceContext().app = 0
total flagged = 47
```
