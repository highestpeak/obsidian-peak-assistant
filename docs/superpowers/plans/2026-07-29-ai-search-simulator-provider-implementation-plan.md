# AI Search Simulator Provider — Implementation Plan

**Date:** 2026-07-29
**Design:** `../specs/2026-07-29-ai-search-simulator-provider-design.md`

## Impact contract

- **Primary outcome:** a complete AI Search plan → review → report flow can run
  with zero outbound model requests.
- **Required tracks:** profile/configuration, in-process streaming provider,
  report bridge and binding correction, tier-policy correction, settings UI,
  scenario tests, build and real-app verification.
- **Forbidden scope:** AI Search dev toolbar, duplicated search/store logic,
  fake Vault responses, external simulator daemon, embedding-index redesign.
- **Stop rule:** do not call the work complete unless the happy path exercises
  real tools and both planning and report generation use the Simulator binding.

## Execution order

1. Add simulator domain types, defaults and scenario classifier.
2. Add the Vercel AI SDK adapter and wire `createLanguageModel`.
3. Add the Claude Agent SDK-shaped text bridge for one-shot report calls.
4. Fix Research profile resolution and Vault Search escalation-policy wiring.
5. Add Provider card, icon, model catalog and role-picker support.
6. Add focused contract tests for configuration, routing, dynamic tool flow,
   latency/failure behavior and no-network guarantees.
7. Run focused tests, the full suite and production build.
8. Reload the plugin in real Obsidian and verify provider configuration plus a
   representative AI Search flow through CDP.

## File ownership

- `src/core/providers/simulator/**`: scenario engine and SDK adapter.
- `src/core/profiles/**`: profile type, defaults and materialization boundary.
- `src/core/providers/vercel/provider-factory.ts`: provider dispatch only.
- `src/service/agents/core/sdkAgentPool.ts`: Simulator one-shot bridge only.
- `src/service/agents/report/ReportOrchestrator.ts`: Research binding fix.
- `src/service/agents/VaultSearchAgent.ts`: persisted tier policy wiring.
- `src/ui/view/settings/**`: provider configuration and selection only.
- `templates/config/models/model-catalog.json`: Simulator model metadata.
- `test/ai-search-simulator-*.test.ts`: focused contracts.

## Verification

```bash
npm run test -- test/ai-search-simulator-provider.test.ts
npm run test -- test/ai-search-simulator-routing.test.ts
npm run test
npm run build
```

Real UI verification follows
`docs/conventions/obsidian-real-ui-qa.md`: discover CDP, plugin-only reload,
DOM assertions, then a visible screenshot.

## Delivery verification

- Focused Simulator/routing/profile/report tests: **5/5 passed**.
- Production build and bundle syntax check: **passed**.
- Full suite: **346/350 passed**. The four failures
  (`chat-studio-message-state-ui`, `code-block-theme-settings`,
  `composer-architecture-source-guards`, and
  `composer-frontmatter-inline-tag-candidate`) reproduce on the untouched
  source worktree and are outside this change.
- Real Obsidian Settings and AI Search interaction:
  **INTERACTION NOT VERIFIED** because the running app exposed no CDP listener.
  No coordinate-click fallback was used.
