# T11P Owner Review Packet

Status: **Needs Review Fix**

Reviewed commits:

```text
28585481 refactor(t11p): close UI->app tail to zero via narrow named ports (T11P)
87f4abe0 test(t11p): add regression guard locking UI->app=0 + honesty metric
c462a290 docs(t11p): add UI->app tail closure implementation note
```

## Verdict

T11P is mostly successful, but not yet accepted as full closure.

The major contract metrics reported by the boundary scanner are green:

```text
total flagged: 47
static UI -> app: 0
service -> app: 7
service -> ui: 0
core -> ui: 0
core -> upstream: 0
raw UI vault/editor: 5
useServiceContext().app: 0
```

However, Codex found one remaining dynamic UI -> app escape hatch that the T11P guard does not catch:

```text
src/ui/view/quick-search/hooks/useGraphAgent.ts:72
  const { AppContext } = await import('@/app/context/AppContext');
```

This violates the T11P closure intent: UI must not reach into `@/app/context/AppContext`, statically or dynamically.

## Finding

### P1 — Dynamic UI -> app import remains in `useGraphAgent`

Evidence:

```text
src/ui/view/quick-search/hooks/useGraphAgent.ts:70-79
  const { GraphAgent } = await import('@/service/agents/ai-graph/GraphAgent');
  // GraphAgent requires raw app + pluginId — use AppContext via dynamic import since we're in an async IIFE outside React render
  const { AppContext } = await import('@/app/context/AppContext');
  const ctx = AppContext.getInstance();
  ...
  const agent = new GraphAgent(ctx.app, ctx.plugin.manifest.id);
```

Why this matters:

- T11P's real goal was not only scanner reduction; it was UI/app closure.
- Dynamic import is still a UI module reaching upward into `src/app/**`.
- The implementation note says full closure landed, but this line keeps an AppContext escape hatch alive.
- The new T11P regression guard passes because it checks selected static imports and selected dynamic settings imports, but not all dynamic `@/app/**` imports under `src/ui/**`.

The intended fix should be small:

- Do not use `AppContext.getInstance()` in `useGraphAgent`.
- Add a narrow `QuickSearchHost` factory method for the current SDK `GraphAgent`, for example:

```text
createGraphAgent(): GraphAgent
```

or a more action-level method if cleaner:

```text
generateKnowledgeGraph(input, signal, onStep)
```

- Compose it in `src/app/quick-search/composeQuickSearchHost.ts`, where raw `app` and `plugin.manifest.id` already belong.
- Update `useGraphAgent.ts` to call the host method.
- Add a guard that catches **all** `@/app/**` imports in `src/ui/**`, including dynamic `import(...)`.

## Required Review Fix

1. Remove the dynamic `@/app/context/AppContext` import from `src/ui/view/quick-search/hooks/useGraphAgent.ts`.
2. Route the `GraphAgent` app/plugin dependencies through an app-composed narrow Quick Search host method.
3. Update `test/t11p-remaining-ui-app-tail-regression.test.ts` so it fails on any `src/ui/**` occurrence of:

```text
from '@/app/...
from "@/app/...
import('@/app/...
import("@/app/...
```

4. Re-run:

```bash
npm run build
npm run audit:boundary -- --out /tmp/t11p-review-fix-boundary.md
npm run test -- test/t11p-remaining-ui-app-tail-regression.test.ts
npm run test -- test/t11o-app-shell-relocation-regression.test.ts
npm run test -- test/t11n-ui-vault-port-regression.test.ts
npm run test -- test/t11m-ui-app-boundary-regression.test.ts test/service-ui-boundary.test.ts
```

5. Amend or add a short review-fix implementation note. It must say:

- dynamic `src/ui/** -> @/app/**` is now 0;
- static `UI -> app` remains 0;
- `useServiceContext().app` remains 0;
- boundary total remains `<=47`;
- no `useServiceContext().plugin` inflation.

## Codex Verification Performed

Commands run:

```bash
npm run audit:boundary -- --out /tmp/t11p-codex-review-boundary.md
npm run test -- test/t11p-remaining-ui-app-tail-regression.test.ts
rg -n "from ['\"]@/app|import\\(['\"]@/app" src/ui -g '*.ts' -g '*.tsx'
rg -n "useServiceContext\\(\\).*\\bplugin\\b|const \\{[^}]*\\bplugin\\b[^}]*\\} = useServiceContext\\(\\)" src/ui -g '*.ts' -g '*.tsx'
```

Observed:

```text
audit:boundary -> 47 findings
T11P guard -> PASS 12/12
dynamic UI -> app import -> 1 remaining
useServiceContext().plugin consumers -> 3
```

## Owner Reading Guide

Read in this order:

1. `src/ui/view/quick-search/hooks/useGraphAgent.ts`
   - Look at the dynamic `AppContext` import and `new GraphAgent(ctx.app, ctx.plugin.manifest.id)`.
2. `src/ui/view/quick-search/hooks/useQuickSearchHost.ts`
   - This is already the right UI-facing boundary for Quick Search.
3. `src/app/quick-search/composeQuickSearchHost.ts`
   - This is the correct app-layer place to close over raw `app` and `plugin`.
4. `test/t11p-remaining-ui-app-tail-regression.test.ts`
   - Add the missing global dynamic import guard.

## Copyable Review Fix Prompt

```text
T11P is close, but Codex found a review-fix blocker.

Read:
docs/superpowers/audits/2026-06-27-t11p-owner-review-packet.md

Fix only this issue:
- src/ui/view/quick-search/hooks/useGraphAgent.ts still dynamically imports @/app/context/AppContext.
- Remove that dynamic UI -> app import.
- Route GraphAgent creation or graph generation through a narrow app-composed QuickSearchHost method.
- Update the T11P guard so it catches all static and dynamic @/app/** imports under src/ui/**, not just selected files.

Do not broaden QuickSearchHost into a raw app/plugin bag.
Do not change graph UI behavior, graph generation behavior, or fallback behavior.
Do not touch Command Gateway, Current Work State, Settings layout, Chat runtime, or scanner thresholds.

Required verification:
npm run build
npm run audit:boundary -- --out /tmp/t11p-review-fix-boundary.md
npm run test -- test/t11p-remaining-ui-app-tail-regression.test.ts
npm run test -- test/t11o-app-shell-relocation-regression.test.ts
npm run test -- test/t11n-ui-vault-port-regression.test.ts
npm run test -- test/t11m-ui-app-boundary-regression.test.ts test/service-ui-boundary.test.ts

Return a short implementation note with before/after evidence:
- dynamic src/ui/** -> @/app/** = 1 -> 0
- static UI -> app remains 0
- useServiceContext().app remains 0
- total flagged remains <=47
- useServiceContext().plugin remains 3 or lower
```
