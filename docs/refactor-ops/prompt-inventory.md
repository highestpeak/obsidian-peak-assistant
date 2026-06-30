# Prompt Inventory

Date: 2026-06-30
Related issue: Issue 2 (owner-code-review-issue-log.md)

Naming convention reference:
- `PromptId`: PascalCase enum key, camelCase slug value (e.g. `AmbientExplanation = 'ambient-explanation'`)
- Template path: `templates/prompts/<slug>.md` (system prompts add `-system` suffix)
- `TemplateRegistry.TEMPLATE_METADATA` must have a matching entry
- Existing pattern for split system/user: `AiAnalysisReportSectionSystem` (system) + `AiAnalysisReportSection` (user)

---

## The 16 Files — Row Table

| # | current file:line | nature of inline prompt | proposed `PromptId` key | proposed template path | variables / inputs | system / user / both | duplication / notes |
|---|------------------|------------------------|------------------------|-----------------------|--------------------|---------------------|---------------------|
| 1 | `src/app/ambient/LlmAmbientExplanationAdapter.ts:44` | System: "You are a concise research assistant. Output only the requested sentence." | `AmbientExplanationSystem` | `templates/prompts/ambient-explanation-system.md` | *(none — static)* | system | User prompt is also built inline at ~line 30–42 (document title + excerpt construction) — needs a paired user template |
| 1b | `src/app/ambient/LlmAmbientExplanationAdapter.ts` (user prompt built inline ~lines 30–42) | User: constructs excerpt + "Explain in one sentence why this note is relevant..." | `AmbientExplanation` | `templates/prompts/ambient-explanation.md` | `noteTitle`, `excerpt`, `contextDescription` | user | Paired with entry 1 |
| 2 | `src/service/usage/optimization/prompt.ts:3` (`OPTIMIZATION_SYSTEM_PROMPT`) | System: "You are an AI usage optimization curator…" with hard JSON output contract | `UsageOptimizationSystem` | `templates/prompts/usage-optimization-system.md` | *(none — static)* | system | User prompt built by `buildOptimizationPrompt()` in the same file — also needs a template (see 2b) |
| 2b | `src/service/usage/optimization/prompt.ts:25` (`buildOptimizationPrompt()`) | User: structured data dump of feature×model stats, no-outcome calls, long sessions | `UsageOptimization` | `templates/prompts/usage-optimization.md` | `monthlyBudgetUsd`, `projectedMonthlyUsd`, `totalMonthlyCostUsd`, `featureModelStatsMarkdown`, `noOutcomeHighCostMarkdown`, `longSessionsMarkdown` | user | Paired with entry 2 |
| 3 | `src/service/copilot/CopilotMetaAgentStream.ts:75` (`SYSTEM_PROMPT_BASE`) | System: "You are the Peak Assistant Auto Review agent." with tool catalog and quality rules. Suffixed by `FAST_MODE_SUFFIX` (line 119) or `COMPLETE_MODE_SUFFIX` (line 124) | `CopilotAutoReviewSystem` | `templates/prompts/copilot-auto-review-system.md` | `mode` (fast/complete — controls which suffix is appended) | system | Very long, mode-branched. Consider using Handlebars `{{#if mode_fast}}` block instead of suffix string concatenation |
| 4 | `src/service/copilot/vault/VaultMetaAgentStream.ts:56` (`SYSTEM_PROMPT_BASE`) | System: "You are the Peak Assistant Vault Review agent." with vault-scope tool catalog | `CopilotVaultReviewSystem` | `templates/prompts/copilot-vault-review-system.md` | *(none — static)* | system | Similar structure to entry 3 but vault-scoped; user prompt is also built inline in the same file |
| 5 | `src/service/agents/ai-graph/infer-thinking-tree.ts:18` (`SYSTEM_PROMPT`) | System: "You analyze document relationships and infer a thinking tree structure." JSON-only output | `GraphThinkingTreeSystem` | `templates/prompts/graph-thinking-tree-system.md` | *(none — static)* | system | User prompt built inline (line 27, `USER_PROMPT_TEMPLATE`) — needs paired template (see 5b) |
| 5b | `src/service/agents/ai-graph/infer-thinking-tree.ts:27` (`USER_PROMPT_TEMPLATE`) | User: "Analyze these documents and infer their hierarchical thinking tree: {{FILES}}" | `GraphThinkingTree` | `templates/prompts/graph-thinking-tree.md` | `filesMarkdown` (pre-formatted file list) | user | Paired with entry 5 |
| 6 | `src/service/agents/ai-graph/graph-system-prompt.ts:19` (`buildGraphSystemPrompt()`) | System: "You are a knowledge graph analyst…" with dynamic `searchQuery` + `sourcesTable` | `GraphAnalysisSystem` | `templates/prompts/graph-analysis-system.md` | `searchQuery`, `sourcesTable` | system | Called from `GraphAgent.ts:76`. Currently uses a builder function; template would use Handlebars. |
| 7 | `src/service/agents/ai-graph/GraphAgent.ts:76` | No inline text — calls `buildGraphSystemPrompt()` from file 6. Included in issue log; no separate template needed beyond entry 6. | — | — | — | — | Covered by entry 6 |
| 8 | `src/service/agents/report/ReportOrchestrator.ts:311` | Inline user prompt: "You are assigning user insights to report sections." JSON output, section list + insight list | `ReportInsightAssignment` | `templates/prompts/report-insight-assignment.md` | `sectionListMarkdown`, `insightListMarkdown`, `userQuery` | user (acts as both — no separate system used) | `systemPrompt: ''` at call site — instructional text is in user turn. Consider adding system. |
| 9 | `src/service/agents/harness/curator/prompt.ts:13` (`CURATOR_SYSTEM_PROMPT`) | System: "你是 Peak Assistant 的配置顾问。" (Chinese) | `HarnessCuratorSystem` | `templates/prompts/harness-curator-system.md` | *(none — static)* | system | User prompt built by `buildCuratorPrompt()` in same file; also needs a template (see 9b) |
| 9b | `src/service/agents/harness/curator/prompt.ts:26` (`buildCuratorPrompt()`) | User: constructs ctx summary + priorErrors + userFollowup for curator agent | `HarnessCurator` | `templates/prompts/harness-curator.md` | `ctxSummary`, `priorErrors`, `userFollowup` | user | Paired with entry 9 |
| 10 | `src/service/copilot/actions/index.ts` | Uses `PromptId.CopilotAgent*` via template system for most actions — mostly already migrated. One exception: `find-solve-tasks` action at line 668 has a new inline system prompt not registered in `PromptId` (see "missed locations" section below). The issue log lists this file as a location, but most of the file already uses templates. | — | — | — | — | Partial: template-backed actions use `ai.renderPrompt(PromptId.CopilotAgentCheckTaskList, ...)` etc. The `find-solve-tasks` inline prompt at line 668 is the remaining violation. |
| 11 | `src/service/lint/insights.ts:73–156` (`buildBrokenLinkPrompt`, `buildMissingTargetsPrompt`, `buildNoisePrompt`, `buildOrphanPrompt`, `buildTagPrompt`, `buildContentPrompt`) | Six user-prompt builders that produce chat-ready instruction strings for Vault Lint AI repair actions | `LintRepairBrokenLinks`, `LintRepairMissingTargets`, `LintRepairNoise`, `LintRepairOrphans`, `LintRepairTags`, `LintRepairContent` | `templates/prompts/lint-repair-broken-links.md`, `lint-repair-missing-targets.md`, `lint-repair-noise.md`, `lint-repair-orphans.md`, `lint-repair-tags.md`, `lint-repair-content.md` | Per prompt: `topFilesMarkdown` / `targetLinesMarkdown` / `folder` + `fileLines` / `linesMarkdown` / `filesMarkdown` | user (all — sent as chat messages to `InsightInlineChat`) | All six are similar pattern; could share a `lint-repair-base.md` partial if Handlebars supports it |
| 12 | `src/ui/view/copilot/review/InsightInlineChat.tsx:71,88` (`buildSystemPrompt()`) | System: two branches — `draft-proposal` ("You are turning an Auto Review insight…") and `follow-up` ("You are a research assistant helping…") | `CopilotInsightDraftSystem`, `CopilotInsightFollowupSystem` | `templates/prompts/copilot-insight-draft-system.md`, `templates/prompts/copilot-insight-followup-system.md` | `subjectPath`, `subjectBasename`, `insightTitle`, `insightBody` (common to both) | system | Mode-branched inside one function; could be two separate templates or one with `{{#if mode_draft}}` |
| 13 | `src/service/agents/vault-sdk/webSearchTool.ts:16` (`WEB_SEARCH_SYSTEM_PROMPT`) | System: "Search the web and provide a comprehensive answer with sources. Cite URLs where possible…" | `WebSearchSystem` | `templates/prompts/web-search-system.md` | *(none — static)* | system | **Exact duplicate** of `src/service/chat/tools/chatToolBuilder.ts:10`. Same string, copy-pasted. |
| 14 | `src/service/chat/tools/chatToolBuilder.ts:10` (`WEB_SEARCH_SYSTEM_PROMPT`) | Same as entry 13 | `WebSearchSystem` (same) | `templates/prompts/web-search-system.md` (same) | *(none — static)* | system | **Duplicate of entry 13** — single template resolves both |
| 15 | `src/core/constant.ts:597` (`PLAN_MODE_SYSTEM_PROMPT`) | System: "You are in PLAN mode. Focus on structured planning and analysis…" | `PlanModeSystem` | `templates/prompts/plan-mode-system.md` | *(none — static)* | system | Lives in `constant.ts` among unrelated constants (DB names, weights, UI caps). Should move to template. |
| 16 | `src/service/skills/builtin/index.ts:44,125,174` | Three inline system prompts embedded in YAML frontmatter within `BUILTIN_SKILLS` markdown strings. Weekly report (line 44), literature review (line 125), vault health analyst (line 174). | `SkillWeeklyReport`, `SkillLiteratureReview`, `SkillVaultHealthAnalyst` | `templates/prompts/skill-weekly-report.md`, `templates/prompts/skill-literature-review.md`, `templates/prompts/skill-vault-health-analyst.md` | `period` (weekly report), *(none for the other two)* | system (embedded as skill `## System Prompt` blocks) | Skills are user-extensible YAML+markdown; builtin skills could be loaded from `templates/skills/` instead of hardcoded strings in TypeScript |

---

## Duplication Map

| duplicate group | files involved | note |
|----------------|---------------|-------|
| `WEB_SEARCH_SYSTEM_PROMPT` | `src/service/agents/vault-sdk/webSearchTool.ts:16` + `src/service/chat/tools/chatToolBuilder.ts:10` | Identical string; single `WebSearchSystem` template resolves both |
| Copilot auto-review system | `src/service/copilot/CopilotMetaAgentStream.ts:75` + mode suffix strings | Same base with two suffixes; template `{{#if mode_fast}}` block would unify |
| Insight inline chat system | `src/ui/view/copilot/review/InsightInlineChat.tsx:71,88` | Two modes in one function; could share variables (`subjectPath`, `insightTitle`, `insightBody`) across two templates |

---

## Missed Prompt Locations (not in the 16-item list)

The following inline LLM-facing instruction strings were found in `src/` outside the 16 declared locations:

| file:line | description | suggested `PromptId` | notes |
|-----------|------------|---------------------|-------|
| `src/service/copilot/actions/index.ts:668` | `find-solve-tasks` action: "You are a task resolution assistant. You search a knowledge vault to find answers to open tasks…" JSON-output contract | `CopilotFindSolveTasksSystem` | This is a **different** action from `CopilotAgentCheckTaskList`. The check-task-list action uses a registered template; this one is inline. |
| `src/service/copilot/vault/VaultMetaAgentStream.ts` (user prompt) | User prompt for the vault review agent is also built inline (not listed in issue log, only system prompt was listed) | `CopilotVaultReview` (user) | Paired with entry 4 above |

---

## Migration Checklist Per Entry

For each entry that needs a new template:
1. Add a `PromptId` enum key + value + `PromptVariables` interface entry in `src/core/prompt/PromptId.ts`
2. Add `TEMPLATE_METADATA` row in `src/core/template/TemplateRegistry.ts` with `path`, `category: 'prompts'`, `systemPromptId` if applicable, `group`, `label`
3. Create `templates/prompts/<slug>.md` with Handlebars variables for each input
4. Replace inline string / builder with `TemplateManager.render(PromptId.X, vars)` at call site
5. Run `npm run test -- test/prompt-template-registry-golden.test.ts` to verify registry contract
