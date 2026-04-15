# AI Analysis Prompt Injection Points

Where RawSearch and MindFlow prompts are loaded and assembled. Changing the template files below is sufficient for prompt edits; no extra code injection overrides these.

## RawSearch (search executor)

| What | Source | Code location |
|------|--------|----------------|
| **System prompt** | `templates/prompts/ai-analysis-agent-raw-search-system.md` | `RawSearchAgent.realStreamInternal()` → `getPromptInfo(PromptId.RawAiSearch)` → `renderPrompt(promptInfo.systemPromptId!, await genSystemInfo())`. Template variables: `current_time`, `vault_statistics`, `tag_cloud`, `vault_description`, `current_focus` from `genSystemInfo()` (`src/service/tools/system-info.ts`). |
| **User prompt** | `templates/prompts/ai-analysis-agent-raw-search.md` | Same method → `renderPrompt(PromptId.RawAiSearch, { ...variables, errorRetryInfo })`. Variables: `prompt` (MindFlow instruction), `userOriginalQuery`, `currentThoughtInstruction`, `currentRawSearchCallReason`, `existing_facts`, optional `errorRetryInfo`. |
| **Instruction into RawSearch** | MindFlow `progress.instruction` | `AISearchAgent`: `instruction = (progress?.instruction ?? '').trim() || getInitialPrompt()`; then `searchAgent.stream({ prompt: instruction, ... })` (~line 315–324). So the **instruction** RawSearch sees is exactly what MindFlow wrote in `submit_mindflow_progress.instruction`. |

There is no separate "Dimension Library" or other directive injected in code; all executor guidance is in the RawSearch **system** template.

## MindFlow (planner)

| What | Source | Code location |
|------|--------|----------------|
| **System prompt** | `templates/prompts/ai-analysis-mindflow-agent-system.md` | `MindFlowAgent.realStreamInternal()` → `getPromptInfo(PromptId.AiAnalysisMindflowAgent)` → `renderPrompt(promptInfo.systemPromptId!, {})`. No variables for system. |
| **User prompt** | `templates/prompts/ai-analysis-mindflow-agent.md` | Same method → `renderPrompt(PromptId.AiAnalysisMindflowAgent, { phase, userQuery, confirmedFacts, previousMindflowMermaid, rollingMindflowHistory, latestRawSearchInfo, vault_map, coverageSummary, knowledge_panel, webSearchEnabled, ... })`. |

## Template registry

- `src/core/template/TemplateRegistry.ts`: maps `PromptId.RawAiSearchSystem` / `RawAiSearch` to `prompts/ai-analysis-agent-raw-search-system` and `prompts/ai-analysis-agent-raw-search`; same for MindFlow.
- `src/service/prompt/PromptId.ts`: enum and variable types; `PromptService.render()` / `getTemplate()` resolve ID → file path and render with Handlebars.

## Summary

- To change what RawSearch is told (graph usage, checkpoint, deliverables): edit **`ai-analysis-agent-raw-search-system.md`**.
- To change what RawSearch receives as the current task: that comes from **MindFlow’s instruction**; edit **`ai-analysis-mindflow-agent-system.md`** so MindFlow outputs the right MapSketch + ReconSequence + deliverable (including seed + neighborhood shortlist and concrete path names when discovered_leads exist).
- No code path injects a competing "dimension library" or overrides the above templates.
