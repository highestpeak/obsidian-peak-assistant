# Peak Assistant Modernization Handoff: T11B-R Copilot Runtime Boot Availability Fix

Branch:
`codex/peak-modernization-refactor`

Source review:

- `docs/superpowers/audits/2026-06-14-t11b-owner-review-packet.md`
- `docs/superpowers/refactor-ops/t11b-copilot-execution-ports-registry-ownership-handoff.md`

## 中文摘要

T11B 的方向正确，但不能接受：`CopilotActionRuntime` 现在只在 `initSqlite()` 成功后绑定。SQLite deferred、native module 未 ready、或 mobile mode 时，Copilot picker 会拿不到 runtime，从而显示空 action list。

T11B-R 只修这个 review blocker。不要回退 ports/runtime，也不要进入 Chat / T12 / deletion wave。

目标规则：

```text
Copilot manual action catalog runtime should be always-on after app boot.
SQLite/Search readiness should affect only specific action execution,
not whether the action catalog exists.
```

## Scope

Allowed:

- Move `composeCopilotActionRuntime(this.app)` + `AppContext.setCopilotActionRuntime(...)` out of the successful `initSqlite()` branch.
- Bind the runtime after `AppContext` and `AIServiceManager` are ready.
- Keep custom prompt refresh non-blocking.
- Make `AppCopilotActionSearchAdapter` lazy/degraded if `SearchClient` is unavailable.
- Make SQLite-dependent semantic/tag adapters degrade gracefully when sqlite repos are unavailable.
- Add tests/source guards for boot placement and degraded ports.

Not allowed:

- Do not restore `CopilotActionRegistry.getInstance()`.
- Do not restore `registerAllCopilotActions()`.
- Do not move UI panels/icons back into service.
- Do not rewrite Chat, Ambient, Vault Review, Quick Search, or Command Gateway.
- Do not change user-facing action labels/panels/prompts unless necessary for an error/degraded state.

## Required Fix

### 1. Bind runtime outside `initSqlite()` success path

Current bad shape:

```text
onload
  -> try initSqlite
    -> success only
      -> setCopilotActionRuntime
```

Target shape:

```text
onload
  -> AppContext created
  -> AIServiceManager init
  -> setCopilotActionRuntime
  -> try initSqlite
```

Exact location is up to implementation, but owner acceptance requires that:

- mobile mode still binds `CopilotActionRuntime`;
- SQLite deferred still binds `CopilotActionRuntime`;
- no double-bind happens when `initSqlite()` is later retried by onboarding/setup.

### 2. Ports should degrade, not prevent catalog visibility

When SearchClient/SQLite is unavailable:

- built-in actions still exist in picker;
- AI/Vault-only actions can still execute;
- search/semantic/tag actions should return empty/structured “not indexed/not ready” outputs or safe errors through their existing action result shape;
- no uncaught `Cannot read properties of null` from `SearchClient`.

Suggested changes:

- `AppCopilotActionSearchAdapter` should accept `() => SearchClient | null | undefined`.
- If missing, return `{ items: [] }` or a clearly handled not-ready result.
- Semantic/tag adapters should catch sqlite-not-ready errors and return empty / `indexed: false` / no-op persistence as appropriate.

### 3. Add guard/test coverage

Add at least one guard for boot placement:

- source-scan `main.ts` to ensure `setCopilotActionRuntime` is not only inside `initSqlite()`;
- or unit-test a small extracted boot helper if one exists.

Add degraded-port coverage:

- `findRelated` with no `SearchClient` returns empty result, not throw.
- semantic graph action with unavailable sqlite returns `indexed: false` or safe empty result.
- tag suggestion persistence missing sqlite does not crash the whole action catalog.

Keep existing T11B tests passing.

## Required Verification

Run sequentially, not in parallel:

```bash
npm run build
npm run test -- test/copilot-action-runtime-source-guard.test.ts test/copilot-action-runtime-ports.test.ts
npm run test -- test/copilot-action-surface-source-guard.test.ts test/copilot-action-surface-registry.test.ts
npm run test -- test/copilot-auto-planner.test.ts test/copilot-command-model.test.ts test/copilot-intent-hub.test.ts
node scripts/audit/boundary-baseline.mjs --out /tmp/t11b-review-fix-boundary-baseline.md
```

Also run:

```bash
rg "registerAllCopilotActions|CopilotActionRegistry\\.getInstance|CustomPromptRegistry\\.getInstance" src main.ts
rg "setCopilotActionRuntime|composeCopilotActionRuntime|initSqlite\\(" main.ts
```

## Implementation Note Required

Report:

```md
## T11B-R implementation note

中文摘要:
- 修了什么:
- 为什么这是 P1:
- 用户可见行为:
- Runtime bind before:
- Runtime bind after:
- SQLite/Search degraded behavior:
- Tests added:

Commit:
- <hash and message>

Changed files:
- ...

Verification:
- ...

Boundary audit delta:
- ...

Known remaining old paths:
- ...
```
