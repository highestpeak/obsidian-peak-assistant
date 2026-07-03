# Cloud Agent SDK & Chat/Agent/Plan Mode — Read-only Audit + Design Options

Owner decision required. This is the Track F output from
`docs/superpowers/plans/2026-07-03-code-handoff-from-doc-annotations.md`.
Code is **not** touched by this document. Two options only — no
"legacy bridge / compatibility" third option per the plan's hard constraint.

## Part A — Cloud Agent SDK

### A.1 Surface inventory

**Settings & config (typed backend):**
- `src/core/config/settingsTypes.ts:199` — `AgentBackend = 'auto' | 'harness' | 'claude-agent-sdk'`
- `src/core/config/settingsTypes.ts:241` — `HarnessSettings.agentBackend`
- `src/core/config/settingsTypes.ts:263` — default `'auto'`
- `src/app/settings/PluginSettingsLoader.ts:402-404` — roundtrip validation
- `src/ui/view/settings/tabs/AISetupTab.tsx:105-113` — settings dropdown labels "Claude Agent SDK"

**Routing / bridge / hard couplings:**
- `src/service/agents/harness-bridge/ClaudeAgentSDKBridge.ts:40,64` — main bridge dispatches when `agentBackend === 'claude-agent-sdk'`
- `src/service/agents/VaultSearchAgentSDK.ts:84` — routing decision
- `src/service/agents/VaultSearchAgent.ts:5-32` — router that **always** delegates to VaultSearchAgentSDK
- `src/service/agents/ContinueAnalysisAgent.ts:17,101` — thin wrapper over VaultSearchAgentSDK
- `src/core/config/settingsTypes.ts:196` — explicit comment: "VaultSearchAgentSDK still uses SDK regardless (HITL coupling)"

**SDK primitive imports (tools + MCP surface, not backend routing):**
- `src/service/copilot/actions/agent-actions.ts:25`
- `src/service/copilot/CopilotOutputMcpServer.ts:17`
- `src/service/agents/core/agentToolMcpAdapter.ts:10`
- `src/service/agents/vault-sdk/webSearchTool.ts:10`
- `src/service/agents/ai-graph/graphMcpServer.ts:12`
- `src/service/agents/vault-sdk/vaultMcpServer.ts:22`
- `src/service/agents/core/sdkAgentPool.ts:4`
- `scripts/run-agent.ts:16`
- `package.json:37` — `@anthropic-ai/claude-agent-sdk ^0.2.101`
- `vite.config.ts:55` — desktop testing mock

**Tests:**
- `test/harness-settings-roundtrip.test.ts:40,55,139-141`
- `test/harness-bridge.test.ts:58,82,102,110`
- `test/b2-copilot-analysis-harness-wire-in.test.ts:69,74`

### A.2 Key coupling to name explicitly

`VaultSearchAgentSDK`, `VaultSearchAgent`, `ContinueAnalysisAgent`, and
several `*mcpServer.ts` files import the SDK for the `tool()` /
`createSdkMcpServer()` primitives — this is **SDK-as-library** and stays
even if the `claude-agent-sdk` **backend** is retired. The distinction
matters for both options below.

### A.3 Option 1 — Keep as supported backend

Scope of code retained:
- All rows in A.1 remain valid.
- `AISetupTab` dropdown keeps `Claude Agent SDK` as the third option.
- Settings roundtrip and bridge tests remain green.

What must change:
- Recruit the SDK backend into a **clear entry point** in AI Setup, not just an
  advanced dropdown. Owner-facing label: "Claude Cloud Agent SDK (cloud,
  requires Anthropic key)."
- Add a health signal that surfaces "Cloud backend requires internet + key" in
  Usage Dashboard when a session actually uses it, so it doesn't fail silently
  in offline vaults.
- Documentation: keep the note in `21-infra-agent-harness.html` and stop
  describing the SDK as "legacy".

Risks: continued maintenance surface (SDK version bumps, HITL loop tests,
onboarding copy for a backend the owner may not personally exercise).

### A.4 Option 2 — Remove as supported backend

Scope of code deleted:
- `AgentBackend` collapses to `'auto' | 'harness'`.
- `ClaudeAgentSDKBridge.ts` removed.
- `AISetupTab` dropdown loses the third option.
- `harness-bridge.test.ts` + roundtrip cases for `'claude-agent-sdk'` removed.
- `settingsTypes.ts:196` comment ("VaultSearchAgentSDK still uses SDK
  regardless") gets rewritten. **The SDK-as-library imports stay** — they
  are the tool/MCP primitives, not backend routing.

What must be preserved:
- Vault Search + Continue Analysis flows keep working via the harness path.
  `VaultSearchAgentSDK` either renames (drop the `SDK` suffix) or is
  factored into a harness-native class. This is the biggest concrete
  refactor hidden inside Option 2.
- Any onboarding copy referencing "Claude Agent SDK" is rewritten.

Risks: refactor of Vault Search + Continue Analysis is nontrivial because
they currently piggyback on SDK's HITL loop for tool-use pause/resume. Owner
should confirm whether harness's tier loop covers HITL semantics before
committing.

### A.5 Recommendation

Prefer Option 2, contingent on owner confirming harness can carry the
HITL semantics currently borrowed from the SDK. If unsure, ship Option 1
with a clearer entry point rather than deleting a backend that some
existing settings still target.

---

## Part B — Chat / Agent / Plan mode choice

### B.1 Surface inventory

**Type + storage:**
- `src/core/ports/ChatRuntimeStatePort.ts:15` — `ChatRuntimeMode = 'chat' | 'agent' | 'plan'`
- `src/ui/view/chat-view/store/chatViewStore.ts:47,88,121` — `chatMode`, `setChatMode`, initial `'chat'`
- `src/app/chat/ChatRuntimeStateAdapter.ts:13-14` — port impl
- `src/core/types/chat.ts:140` — `ChatMeta.conversationType`
- `src/service/chat/service-conversation.ts:96,108,179` — persist + restore per conversation

**UI:**
- `src/ui/view/chat-view/components/Composer.tsx:85-172` — segmented control + run-chip popover, `RUN_MODE_OPTIONS`
- `src/ui/view/chat-view/view-Home.tsx:127,136` — CTA buttons that pre-set `chatMode`
- `src/ui/view/chat-view/chatStrings.ts:649-651` — labels `runChipModeChat`, `runChipModeAgent`, `runChipModePlan`

**Runtime routing:**
- `src/ui/view/chat-view/hooks/useChatSubmit.ts:81-83` — reads mode, calls `ProfileRegistry.getConfigForMode`
- `src/core/profiles/ProfileRegistry.ts:200-203` — `mode === 'agent' ? getActiveAgentConfig() : getActiveChatConfig()`
- `src/ui/view/chat-view/hooks/useChatSession.ts:50-84` — restore mode from persisted meta

**Test coverage:**
- `test/chat-runtime-state-port.test.ts:25` — port contract

### B.2 Key observation

Today's triad only carries **two** effective routes: agent-profile vs
chat-profile. `Plan` is a UI label, not a runtime branch. So the visible
picker is already denser than the behavior it selects.

### B.3 Option 1 — Keep visible triad

Scope of change:
- Keep `chatMode`, keep the segmented control.
- Give **Plan** a real runtime branch — either its own prompt template
  (planner prompt with structured plan schema) or its own profile slot.
- Update `getConfigForMode` to return three distinct configs.
- Add persistence for `activePlanConfig` in `ProfileSettings`.

Risks: the picker becomes more meaningful, but the user still has to know
which mode fits which intent. Doesn't address the annotation's core
complaint ("collapse visible mode choice"). Only pick this if the owner
believes the triad has product value that outweighs the friction.

### B.4 Option 2 — Collapse to intent router

Scope of change:
- Remove the visible segmented control in `Composer` + `view-Home`.
- Keep `ChatRuntimeMode` internally as a **derived** field, decided by an
  **intent router**. Composer stops writing mode; instead a service reads
  the user's message + attachments + selection context and picks
  chat/agent/plan behind the scenes.
- `ChatRuntimeStatePort.setChatMode` becomes internal-only (used by the
  intent router / persistence, not by UI).
- Meta.conversationType still persists what was chosen, so history
  restoration shows "this thread was answered as Plan" without asking
  the user to set it up front.
- Prompt/template branching stays — the router is the sole caller.
- New: intent router spec (rules for when to escalate to Plan vs Agent
  vs Chat). This is the actual product design work, and should live in
  its own spec (`intent-router-v1.md`).

Risks: the intent router is a new service surface. Getting it wrong
routes users into the wrong runtime silently. Mitigate by: (a) always
showing a *subtle* "answered as Agent" chip on the assistant message
so the user can override, (b) instrumenting router hit-rate for the
first N weeks, (c) shipping router behind a feature flag so we can
revert to the visible picker without a settings migration.

### B.5 Recommendation

Prefer Option 2 (intent router), but land it in **two stages**:

1. Ship the router in "recommend only" mode: it renders a suggested
   mode chip on the composer, user still confirms.
2. After telemetry shows agreement rate > 80%, flip default to auto and
   hide the picker.

If the owner wants a single-stage cut, ship stage 2 directly, but keep
the manual override always available on the assistant message.

---

## Cross-track dependency

Option 2 in Part A (retire Cloud Agent SDK backend) and Option 2 in
Part B (collapse mode choice) both remove visible knobs from AI Setup.
If both land, the settings screen becomes noticeably simpler — worth
coordinating the copy pass and the Onboarding wizard update (Track B
of the code-handoff plan) so we don't ship half a rename.

## Verification harness for either decision

- `test/harness-settings-roundtrip.test.ts` guards `AgentBackend` shape.
- `test/harness-bridge.test.ts` guards dispatch semantics.
- `test/chat-runtime-state-port.test.ts` guards mode routing seam.

Every option above breaks at least one of these; the failing test is a
required signal, not collateral damage. Update — do not delete — them as
part of whichever option ships.
