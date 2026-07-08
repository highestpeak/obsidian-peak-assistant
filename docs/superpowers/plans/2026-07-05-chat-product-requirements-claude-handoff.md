# Chat product requirements from doc annotations — Claude handoff

Date: 2026-07-05

This report extracts the product/function changes that came out of the browser annotations on `docs/index.html` and `docs/11-feature-chat-context.html`. The pure documentation fixes were handled separately. This file is for handing the remaining product work to Claude Code.

## Reader and purpose

Reader: Claude Code or another implementation agent working inside this Peak Assistant checkout.

Purpose: turn three product requirements into an implementation-ready investigation and, where safe, code changes.

This handoff is not a request to redo the docs polish. It is about product/runtime behavior.

## Current gating note

`docs/progress.md` currently says:

> 不要提前做 Current Work State、Chat 或 Command Gateway；Command Gateway 仍是 T12 capstone

So this handoff should only be executed when the owner explicitly decides to start this product wave. Until then, treat it as prepared work, not active work.

## Product requirements

### R1. Productize recent activity into Current Work State

User need:

When the user asks Chat inside Obsidian, the model should know the user's recent working process, not just the last message. Recent activity is a record log: opened files, searches, document edits, analysis actions, and other meaningful moves. It should explain the user's current thinking/work state.

Current facts:

- `ActivityIndexSlot` already exists and renders recent activities into Chat context.
- `ChatProfile` already enables `activity-index` as optional context.
- `SessionContextService` already persists activity rows through `MobiusOperationRepo` and records file-open events.
- Existing context tools include `get_activity_detail`.

Product target:

- Make Current Work State a reliable context source, not an incidental activity list.
- Audit which actions are currently recorded and which important actions are missing.
- Keep the model-facing form compact: one-line recent activity rows, expandable by tool when needed.
- Do not turn this into a todo manager. It is a work-state / thought-trace aid.

Acceptance:

- A chat request after recent searches/files/actions includes a concise activity index.
- Important user actions are captured consistently enough to support "what was I just working on?".
- Activity context stays budget-safe and privacy-conscious.
- Tests cover grouping, rendering, and at least one newly captured action type.

### R2. Collapse visible Chat / Agent / Plan into one product mode

User need:

The user should not have to understand three same-level conversation modes. There should be one Chat experience. The system can still choose tools or planning behavior internally based on intent, model capability, profile, toggles, and permissions.

Current facts:

- `NewConversationTypePicker` still renders three options: Chat, Agent, Plan.
- `chatViewStore` still has `chatMode: 'chat' | 'agent' | 'plan'`, defaulting to `agent`.
- `ConversationService.streamChat()` still reads runtime mode, persisted conversation type, and `/plan` intent.
- The comment says persisted conversation type should have priority before runtime mode, but the code currently computes `runtimeMode ?? convTypeKind ?? 'chat'`.
- `/plan` prefix already exists as a single-message planning intent.

Product target:

- Remove the visible "choose Chat / Agent / Plan" product step for new conversations.
- Keep backward compatibility for old persisted conversations where needed.
- Preserve `/plan` as a single-message intent if it is useful and tested.
- Tools should be available through capability/toggle/permission strategy, not because the user selected an "Agent" product mode.
- Update misleading comments and tests so the code no longer claims mode routing is retired while still depending on it in a confusing way.

Acceptance:

- New conversation UX no longer shows three equal mode cards.
- New conversations land in one default Chat experience.
- Tool injection still works when Web/Vault capabilities are enabled and allowed.
- `/plan` continues to produce planning-focused output without creating a persistent mode.
- Legacy conversations do not crash; any legacy mode handling is contained and documented in code.

### R3. Make rich generation extensible instead of Mermaid/Bases-only

User need:

Rich generation should be a general Chat capability: the model can generate structured outputs such as diagrams, Bases files, tables, tasks, or future artifact types. Mermaid and Obsidian Bases are current examples, not the whole product concept.

Current facts:

- `templates/prompts/conversation-system.md` currently contains Mermaid and Obsidian Bases conventions.
- Mermaid rendering/click-through support exists in the streamdown rendering layer.
- Bases output is copyable source only; Chat view should not fake a full Obsidian Bases renderer.
- The repository has configurability rules: do not hardcode large maps, schemas, labels, thresholds, or prompt bodies directly in logic files when templates/config can own them.

Product target:

- Define a small rich-output capability contract.
- Keep Mermaid and Bases as current supported output types.
- Make future output types pluggable by convention/config, not by burying long schemas in random prose or logic files.
- Preserve current behavior and avoid overbuilding a renderer registry unless the existing UI path needs it.

Acceptance:

- Prompt/template structure clearly separates current supported rich outputs from future candidates.
- Mermaid and Bases instructions remain available to Chat.
- Bases stays source-only in Chat, with no fake inline renderer.
- Tests or structural guards prevent accidental removal of the rich-output prompt conventions.

## Combined execution prompt for Claude Code

Copy the whole prompt below into Claude Code.

```text
You are working in:
/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

Goal:
Implement a product cleanup wave for Chat context based on owner browser annotations. This is NOT a docs-polish task. The product work has three tracks:

1. Productize recent activity into Current Work State.
2. Collapse visible Chat / Agent / Plan into one product mode.
3. Make rich generation extensible instead of Mermaid/Bases-only.

Important repo rules:
- Read AGENTS.md and docs/progress.md first.
- Respect the current progress note: if docs/progress.md still says not to prematurely do Current Work State / Chat, treat this prompt as owner-approved only if the user has explicitly told you to proceed now. If not, stop after read-only investigation and return a plan.
- Never revert user changes.
- Keep unrelated dirty worktree changes intact.
- Do not add service-layer runtime singletons or expand service-side AppContext.getInstance() usage.
- Configurability rule: do not hardcode large prompt/config tables in logic files. Prefer TemplateManager/templates/config or a clearly named domain defaults file that documents the mirrored template.
- Use existing tests and patterns. Add focused tests for changed behavior.
- This repo uses shadcn/ui Button patterns and avoids raw production UI buttons; follow existing UI conventions.

Stage 0 — read-only investigation first:
Inspect these files and their callers:

- src/service/context/SessionContextService.ts
- src/service/chat/context/slots/ActivityIndexSlot.ts
- src/service/chat/context/profiles/ChatProfile.ts
- src/service/context/context-tools/getActivityDetailTool.ts
- templates/prompts/activity-index-render.md
- src/service/chat/service-conversation.ts
- src/core/ports/ChatRuntimeStatePort.ts
- src/app/chat/ChatRuntimeStateAdapter.ts
- src/ui/view/chat-view/store/chatViewStore.ts
- src/ui/view/chat-view/hooks/useChatSession.ts
- src/ui/view/chat-view/hooks/useChatSubmit.ts
- src/ui/view/chat-view/view-Messages.tsx
- src/ui/view/chat-view/components/NewConversationTypePicker.tsx
- templates/prompts/conversation-system.md
- src/ui/component/mine/StreamdownIsolated.tsx
- src/styles/streamdown-isolated-css.ts

Return, before editing, a short candidate matrix:
- Track
- Current behavior confirmed from code
- Proposed change
- Files likely touched
- Tests likely touched/added
- Risk level
- Skip rule

If all changes are safe or medium-safe, continue implementing in the same session. If you find a high-risk product decision, stop and return the plan instead of guessing.

Impact contract:
- Visible new-conversation UX no longer presents Chat / Agent / Plan as three peer product modes.
- One default Chat experience remains able to use tools when model/profile/toggles/permissions allow.
- `/plan` remains a single-message planning intent, not a persistent product mode.
- Recent activity remains in Chat context and becomes more product-grade: coverage audited, at least one meaningful missing action path captured if evidence shows a gap, and rendering remains compact.
- Rich generation conventions become easier to extend without hiding a long schema in logic files.
- No feature deletion to hit line counts.
- Build and focused tests must pass.

Track A — Current Work State / recent activity:
1. Audit current activity capture:
   - What operation types are recorded?
   - Which EventBus events feed SessionContextService?
   - Which user-visible actions are missing but cheap to capture?
2. Improve the model-facing activity index without bloating context:
   - Keep one-line rows.
   - Keep get_activity_detail as the expansion path.
   - Preserve max token/budget behavior.
3. If a clear missing action path is safe to add, wire it through the existing event/activity path.
4. Add or update tests:
   - SessionContextService grouping/building behavior.
   - ActivityIndexSlot rendering/compression.
   - Newly captured action path if implemented.
5. Do not build a new visible dashboard or todo manager in this wave.

Track B — Unified Chat mode:
1. Remove the visible three-card NewConversationTypePicker from new conversation creation, or replace it with a single Chat start surface following existing UI patterns.
2. Keep legacy conversationType handling only as compatibility. Do not make users choose it for new conversations.
3. Fix service-conversation mode resolution if current code contradicts comments. The intended priority is:
   - `/plan` single-message intent wins.
   - legacy persisted conversation type may be read only for old data if still needed.
   - default new conversation behavior should be one Chat experience with tool access controlled by capabilities/toggles/permissions, not by a user-selected "Agent" mode.
4. Preserve web/vault tool injection behavior. If removing runtime chatMode would disable tools, introduce a clearer execution-strategy helper instead of relying on UI mode state.
5. Update comments and tests so they describe the real product state.
6. Add or update tests:
   - New conversations do not require mode selection.
   - `/plan` detection still works.
   - Tool injection still occurs under the right capability/toggle conditions.
   - Legacy mode metadata does not crash.

Track C — Rich generation contract:
1. Audit current Mermaid/Bases prompt conventions and renderer support.
2. Refactor prompt/template organization so "rich generation" is presented as supported output types, with Mermaid and Bases as current entries.
3. Keep Bases source-only in Chat. Do not implement a fake Bases renderer.
4. Do not overbuild a full runtime registry unless current code needs it. A template/config-backed convention map plus tests/guards may be enough.
5. Add or update tests/guards:
   - conversation-system prompt still includes Mermaid convention.
   - conversation-system prompt still includes Bases convention.
   - rich-output convention source is registered through TemplateRegistry/PromptId or an existing template path.

Protected scope:
- Do not touch Command Gateway in this wave.
- Do not redesign the whole Chat UI.
- Do not rewrite provider adapters except for the smallest necessary execution-strategy boundary.
- Do not remove activity logging, Search, Mermaid rendering, Bases source output, or legacy conversation loading.
- Do not update docs/progress.md unless the owner explicitly asks at the end.

Verification:
Run the smallest meaningful set first:
- npm run test -- test/session-context-service.test.ts
- npm run test -- test/plan-intent-detection.test.ts
- npm run test -- test/chat-runtime-state-port.test.ts
- any new/changed focused tests
- npm run build

If any command fails because of pre-existing unrelated failures, report:
- command
- exact failure
- why it is unrelated or related
- what you verified instead

Final implementation note:
Return in Chinese:
- What changed by track.
- What was intentionally skipped and why.
- Exact tests/build commands and outcomes.
- Any remaining product decision the owner must make.
- Changed code files and recommended reading order.
```

## If this needs to be split later

Default is the combined prompt above. Split only if Claude reports a high-risk blocker.

Suggested split order:

1. Unified Chat mode cleanup, because it removes the visible product confusion.
2. Current Work State / recent activity audit and coverage, because it affects context behavior.
3. Rich generation convention cleanup, because it is valuable but less central to Chat's main request path.
