# AI Search Simulator Sidecar — Implementation Plan

**Date:** 2026-07-29
**Design:** `../specs/2026-07-29-ai-search-simulator-provider-design.md`

## Impact contract

- **Primary outcome:** the complete AI Search plan → review → report flow runs
  through a separately started localhost Provider with zero paid requests.
- **Required tracks:** dual-protocol sidecar, thin plugin adapter, existing
  Provider UI, Research binding, startup scripts, spawned-process tests,
  production bundle exclusion and real-app verification.
- **Forbidden scope:** AI Search dev toolbar, fake Vault responses, duplicated
  stores/tools, silent OpenRouter fallback and scenario code in `main.js`.
- **Stop rule:** do not call the work complete unless both Vercel AI SDK
  planning and Claude Agent SDK reporting reach the sidecar over HTTP.

## Execution order

1. Move the scenario engine and response config to
   `tools/ai-search-simulator/`.
2. Implement OpenAI Chat and Anthropic Messages streaming endpoints.
3. Replace the in-process language model with a thin OpenAI-compatible client.
4. Route the normal Claude Agent SDK to the sidecar through materialized
   endpoint and per-request headers.
5. Make Provider Connection Test perform a real health check.
6. Add `npm run simulator` and `npm run dev:simulator`.
7. Replace in-process tests with spawned-sidecar integration tests.
8. Verify bundle exclusion, focused/full tests, production build and real UI.

## File ownership

- `tools/ai-search-simulator/**`: standalone server and all simulated behavior.
- `src/core/providers/simulator/client.ts`: thin transport contract only.
- `src/core/profiles/**`: persisted endpoint/config and Agent SDK materializer.
- `src/core/providers/vercel/provider-factory.ts`: provider dispatch only.
- `src/ui/view/settings/**`: endpoint/scenario configuration and selection.
- `test/helpers/simulatorSidecar.ts`: spawned process fixture.
- `test/ai-search-simulator-*.test.ts`: HTTP/SDK/tool-flow contracts.

## Verification

```bash
npm run simulator
npm run dev:simulator
npm run test -- test/ai-search-simulator-provider.test.ts
npm run test -- test/ai-search-simulator-routing.test.ts
npm run test
npm run build
```

Bundle verification must prove that sidecar-only error copy and fixture paths
do not appear in `main.js`.

Real UI verification follows
`docs/conventions/obsidian-real-ui-qa.md`: discover CDP, plugin-only reload,
DOM assertions, then visible evidence. If CDP is unavailable, report the exact
interaction as `INTERACTION NOT VERIFIED`.

## Delivery verification

Completed on 2026-07-29:

- The focused five-file suite passed: Simulator HTTP/protocol coverage, real
  Vercel AI SDK planning, real AgentLoop tool-call/schema behavior, real Claude
  Agent SDK routing, profile materialization, AI Search binding, Vault Search
  harness and report session.
- `npm run build` passed. The bundle boundary check confirmed that sidecar
  scenario errors, fixtures and response copy are absent from `main.js`.
- The full suite completed with 346/350 files passing. Its four failures are
  the unchanged pre-existing Chat Studio/Composer failures:
  `chat-studio-message-state-ui`, `code-block-theme-settings`,
  `composer-architecture-source-guards`, and
  `composer-frontmatter-inline-tag-candidate`.
- Both `npm run simulator` and `npm run dev:simulator` were started manually;
  the health/model endpoints and parallel plugin watchers became ready.
