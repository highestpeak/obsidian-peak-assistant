# Vault Search · Harness-Native Migration

**Status — cutover landed 2026-07-04.** `VaultSearchAgent` (and
`ContinueAnalysisAgent` through it) now runs on the self-hosted harness
`runAgentLoop`. The legacy `VaultSearchAgentSDK.ts` file has been deleted;
its callers were rewired to the harness shell. Guarded by
`test/vault-search-harness.test.ts`.

**Follow-ups still open** (tracked separately; none block the cutover):

- Rename the `vault-sdk/` folder to `vault-mcp/` (or fold `vaultMcpServer`
  impls into `vault/`) — cosmetic, no runtime consequence.
- Trim `sdkAgentPool.ts` if the remaining SDK library callers migrate off
  `queryWithProfile`. Today it still has one-shot callers under
  `service-manager.ts`, `GraphAgent`, `webSearchTool`, so the module stays.
- Delete `sdkMessageAdapter.ts` if `translateSdkMessage` loses all callers.
  Currently `service-manager.ts` and `webSearchTool.ts` still consume
  `collectText`/`translateSdkMessage`, so it stays.

The historical migration plan and blast-radius table are preserved below
for future audits and for the rename cleanup follow-up.

## Original context (pre-cutover)

This spec was authored as follow-up to Debt-4 from the 2026-07-03 F.A audit
(`docs/superpowers/specs/2026-07-03-cloud-sdk-and-mode-choice-audit.md`).
It enumerated the concrete steps to move `VaultSearchAgentSDK` off Claude
Agent SDK's `query()` orchestration and onto the self-hosted harness's
`runAgentLoop`. The first blocking harness contract had landed:
`AgentLoopConfig.stopWhen(step)` can terminate a loop after a domain tool
success, so `vault_submit_plan` no longer needs SDK result-message semantics.
The harness-native Vault Search tool adapter also existed at
`src/service/agents/vault/vaultHarnessTools.ts` and was covered by
`test/vault-harness-tools.test.ts`. The remaining work was the Vault Search
loop shell plus UI stream parity — now done.

## Why this is deferred

F.A already retired the user-visible `Claude Agent SDK` backend option.
What remains is a code-hygiene concern: `VaultSearchAgentSDK` still uses
SDK primitives internally (`queryWithProfile` → SDK's `query()`,
`createSdkMcpServer` → tool bundling, `tool()` → tool defs). A reader
scanning `src/service/agents/*.ts` will still find `SDK`-suffixed classes
even though the setting is gone.

The migration is deferred because:

1. **HITL semantics used to be borrowed from SDK.** The `vault_submit_plan`
   tool is currently the loop's terminator: the SDK's `query()` yields a
   `result` message right after `submit_plan` returns from the MCP server,
   and the shell breaks out. The harness now exposes
   `AgentLoopConfig.stopWhen(step)`, so the missing loop contract is solved;
   the remaining work is translating `AgentLoopResult` back into the existing
   UI event stream and cutting over the route.
2. **No live-QA harness for this class.** The unit test in
   `test/vault-mcp-tools.test.ts` exercises the tool `*Impl` functions
   in isolation. There is no end-to-end regression test that runs a
   full vault search against a real (or golden-fixture) vault, so a
   rewrite would ship without a safety net.
3. **562 lines in `vaultMcpServer.ts` + 371 lines in
   `VaultSearchAgentSDK.ts` + 45 lines of router**. Large surface, easy
   to break streaming behavior in ways only a live vault surfaces.

## Migration plan (when we run it)

### Phase 1 — Tool shape adapter

Landed as `src/service/agents/vault/vaultHarnessTools.ts`:

- Reuses the existing six `*Impl` functions unchanged (they are pure).
- Wraps each in the harness `ToolDef` shape:
  `{ name, description, parameters: <Zod schema>, execute: (args) => Impl(args, ctx) }`.
- Keeps the UI-compatible `mcp__vault__*` tool names.
- Keeps `vault_submit_plan` as a special-case tool that returns
  `{ approved, adjustedPaths, adjustedOutline }` and sets a shared
  `SubmitPlanState` object the outer loop reads to decide whether to
  break.

### Phase 2 — Loop shell

Add `src/service/agents/VaultSearchAgentHarness.ts` (or overwrite
`VaultSearchAgentSDK.ts` and rename once the migration is verified):

- Instantiate a `TierController` seeded with the active online profile
  (Anthropic Claude or whichever provider the user selected).
- Build a `ContextManager` with `maxTokens` matching the profile's
  capability and — if wired — the fast-role
  `CompactSummarizer` from `compactSummarizerRuntime`.
- Compose the tools list via the Phase 1 adapter.
- Call `runAgentLoop({ loopId, systemPrompt, initialMessages, tools,
  tierController, memory, context, maxSteps: 20, stopCondition:
  submitPlanState.wasSubmitted })`.
- Consume the returned `AgentLoopResult` and translate step events to
  `LLMStreamEvent` using the same trigger/naming conventions as
  `translateSdkMessage`.

### Phase 3 — Stop condition + trace parity

The harness `runAgentLoop` now accepts `stopWhen(step) → boolean`, evaluated
after each completed step. Vault Search should pass:

```ts
stopWhen: (step) => step.toolResults.some((r) => r.toolName === 'vault_submit_plan' && r.ok === true)
```

Also: emit the same `pk-debug` events (`vault-sdk-starting`, round
markers) so downstream UI (SearchProcessView) does not need to change.

### Phase 4 — Cleanup

Once Phase 3 lands and vault search reruns green end-to-end:

- Rename `VaultSearchAgentSDK.ts` → `VaultSearchAgent.ts` (delete the
  thin router file that currently owns the export).
- Update every import (`AppContext.ts`, `composeQuickSearchHost.ts`,
  `ContinueAnalysisAgent.ts`, `useSearchSession.ts`,
  `useQuickSearchHost.ts`).
- Trim `sdkAgentPool.ts` if `queryWithProfile` no longer has callers.
  (Grep at the time of migration — several one-shot LLM callers use it,
  so this file likely stays for those.)
- Delete `sdkMessageAdapter.ts` if `translateSdkMessage` no longer has
  callers.
- Rename `vault-sdk/` folder → `vault/` since the SDK naming is stale.

## Estimated blast radius

| Layer            | File                                      | Risk       |
| ---------------- | ----------------------------------------- | ---------- |
| Tool adapter     | vaultHarnessTools.ts                      | Done       |
| Loop shell       | VaultSearchAgentHarness.ts (new)          | Medium     |
| Stop condition   | runAgentLoop stopWhen hook                | Done       |
| Streaming trace  | translation from AgentLoopResult          | Medium     |
| Rename + imports | 5+ callers                                | Low        |
| Cleanup          | delete sdkAgentPool / sdkMessageAdapter   | Low if no other callers |

Roughly 3–5 hours implementation + 2 hours live QA on a real vault.

## Verification gate

Before removing the `SDK` suffix from any class name:

- `npm run test` green — including new `test/vault-search-harness.test.ts`.
- Manual QA: search "diffusion papers", search "resolve pipeline
  bugs", search with `?web=true`, search with plan auto-approve OFF.
- Verify no regression in
  `SearchProcessView` event order.
- Verify no regression in `ContinueAnalysisAgent` (it wraps the same
  runtime).

## What ships in 2026-07-04 without the migration

`VaultSearchAgentSDK` stays as-is, but the misleading comments about
"selecting harness backend errors out" are removed. The user-visible
surface is unchanged (F.A already removed the dropdown option). The
`SDK` suffix in the class name is now a legibly-explained internal
detail — not a routing signal.
