# Prompt Template Override Panel — Design Spec

## Overview

A modal panel that lets users discover, browse, and override all prompt templates used by the plugin. Users can view every prompt organized by category, see which ones they've customized, and click to create/open override files in the Obsidian editor.

## Goals

- **Discoverability**: Users can see all 63 active prompts, what each does, and where it's used
- **Override simplicity**: One click creates a vault file with the default content + variable documentation; editing is done in Obsidian's editor
- **Status visibility**: Clear indication of which prompts are overridden (full, partial, or not at all)
- **Zero runtime impact**: No changes to how `PromptService.render()` resolves prompts at call sites

## UI Design

### Modal Structure

`PromptTemplateModal` — 680px Obsidian Modal, same pattern as `CopilotPickerModal`.

**Layout (top to bottom):**
1. **Header**: Title "Prompt Templates" + search input (220px)
2. **Body**: Scrollable grouped list of prompt items
3. **Footer**: "N of M overridden" stats + "Open Prompts Folder" button

### Groups

Six groups, ordered by user relevance:

| Group | Default State | Contents |
|-------|--------------|----------|
| Chat | Expanded | ConversationSystem, ConversationSummaryShort/Full, ProjectSummaryShort/Full, ApplicationGenerateTitle, SearchRerankRankGpt, ChatTopicAggregation, ChatSuggestFollowups, ChatSuggestActions |
| User Profile | Expanded | MemoryExtractCandidatesJson, ContextMemory, UserProfileContext, ProfileFromVaultJson, UserProfileOrganizeMarkdown |
| Copilot | Expanded | DocPolish, DocReview, DocSplitSuggestion, DocSuggestTags, DocSummarize, DocExtractConcepts, DocTranslate, VaultHealth, WritingContinue, WritingRewrite, CopilotAgentSuggestLinks, CopilotAgentKnowledgeGaps, CopilotAgentSynthesizeTopic, CopilotAgentAddEvidence |
| Search & Analysis | Collapsed | AiAnalysisTitle, AiAnalysisDocSimpleScope/System, AiAnalysisMermaidFix/System, AiAnalysisFollowup/System, AiAnalysisSaveFileName, AiAnalysisSaveFolder, AiAnalysisVaultReportSummary/System, AiAnalysisReportSection/System, VaultSdkPlaybook, AiAnalysisContinue/System, AiAnalysisSynthesize/System |
| Indexing | Collapsed | DocSummaryShort/Full, ImageDescription, ImageSummary, DocTagGenerateJson, PatternDiscovery, KnowledgeIntuitionPlanSystem, KnowledgeIntuitionPlan, KnowledgeIntuitionSubmit |
| Ambient Context | Collapsed | WorkingThemeInference, WorkingContextRender, ActivityIndexRender, MessageResources |

Each group header shows: chevron + group name + "N / M" override count (N highlighted in accent color when > 0).

### Prompt Items

**Paired prompts** (have both system and user template files):
- Item row: dot indicator + label. Not directly clickable.
- Below the label: two clickable chip buttons — `system` and `user` — each with its own dot and override status.
- Override dot states: filled (overridden), empty (default).
- Parent item dot: filled = both overridden, half-filled = one overridden, empty = neither.

**Single prompts** (only one template file):
- Item row is directly clickable. Dot + label + optional `overridden` badge.

**All items:**
- Hover shows tooltip with: title, scene tag (e.g. "Chat > Every conversation"), description text.
- Overridden items show a `Reset` button on hover (right side of the row).

### Search

Top-right search input filters items by label match. When searching:
- All groups expand
- Non-matching items are hidden
- Matching items are highlighted
- Clear search restores original expand/collapse state

### Footer

- Left: `N of M overridden` — N in accent color
- Right: `Open Prompts Folder` button — reveals `{rootFolder}/Prompts/` in Obsidian file explorer

## Override File Format

Override files live at `{rootFolder}/Prompts/{promptId}.prompt.md` in the vault (existing convention from `PromptService.loadOverride()`).

When created, the file contains a `prompt-meta` documentation block followed by the full default template:

````markdown
```prompt-meta
id: conversation-system
label: Chat System Prompt
description: The core system instruction for all chat conversations
variables:
  - userProfile: User profile summary
  - capabilities: List of enabled capabilities
  - workingContext: Current working context
  - memoryContext: Long-term memory summary
note: Changes take effect immediately. Delete this file to restore the default.
```

You are a knowledgeable AI assistant...
{{#if userProfile}}
## User Profile
{{{userProfile}}}
{{/if}}
````

### prompt-meta Block Parsing

`PromptService` strips the `prompt-meta` block before Handlebars rendering using structured line-by-line parsing:

```typescript
function stripPromptMeta(content: string): { meta: string | null; template: string } {
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim();
  if (!firstLine?.startsWith('```prompt-meta')) {
    return { meta: null, template: content };
  }
  const closeIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '```');
  if (closeIndex === -1) {
    return { meta: null, template: content };
  }
  const meta = lines.slice(1, closeIndex).join('\n');
  const template = lines.slice(closeIndex + 1).join('\n').trimStart();
  return { meta, template };
}
```

Rules:
- Block must start at line 1 of the file (no preceding content)
- Opening fence is `` ```prompt-meta ``
- Closing fence is a line containing only `` ``` ``
- Content between fences is YAML (for human reading; not parsed by the runtime)
- Everything after the closing fence is the template

## Interaction Flows

### Click to Create Override

1. User clicks a prompt's `system` or `user` sub-item (or the item row for single prompts)
2. Check if `{rootFolder}/Prompts/{promptId}.prompt.md` exists in vault
3. **Does not exist:**
   a. Read default template content via `TemplateManager.getTemplate(id)`
   b. Build `prompt-meta` block from `TemplateMetadata` (label, description) and `PromptVariables` (variable names)
   c. Write `prompt-meta` + template content to vault via `app.vault.create()`
   d. Open the file in Obsidian editor via `app.workspace.openLinkText()`
   e. Refresh item's override status in the modal
4. **Already exists:**
   a. Open existing file in Obsidian editor
   b. No content changes

### Reset to Default

1. User hovers an overridden item, clicks `Reset`
2. Confirmation dialog: "Reset to default? This will delete your custom prompt file."
3. On confirm: delete `{rootFolder}/Prompts/{promptId}.prompt.md` via `app.vault.delete()`
4. Clear `PromptService.overrideCache` entry for this id
5. Refresh item's override status in the modal

### Open Prompts Folder

1. User clicks "Open Prompts Folder" in the footer
2. Reveal `{rootFolder}/Prompts/` in Obsidian's file explorer via `app.workspace.revealLeaf()` or equivalent

## Data Model Changes

### TemplateMetadata Extension

In `TemplateRegistry.ts`, extend `TemplateMetadata`:

```typescript
interface TemplateMetadata {
  // existing
  path: string;
  category: string;
  expectsJson?: boolean;
  jsonConstraint?: string;
  systemPromptId?: string;
  // new
  label?: string;           // Human-readable name, e.g. "Chat System Prompt"
  description?: string;     // One-line usage description
  group?: PromptGroup;      // UI grouping
}

type PromptGroup = 'chat' | 'userProfile' | 'copilot' | 'searchAnalysis' | 'indexing' | 'ambientContext';
```

All 63 active prompts get `label`, `description`, and `group` populated in `TEMPLATE_METADATA`.

### PromptGroup Display Config

```typescript
interface PromptGroupConfig {
  key: PromptGroup;
  label: string;          // Display name
  defaultExpanded: boolean;
  order: number;
}

const PROMPT_GROUPS: PromptGroupConfig[] = [
  { key: 'chat',            label: 'Chat',              defaultExpanded: true,  order: 0 },
  { key: 'userProfile',     label: 'User Profile',      defaultExpanded: true,  order: 1 },
  { key: 'copilot',         label: 'Copilot',           defaultExpanded: true,  order: 2 },
  { key: 'searchAnalysis',  label: 'Search & Analysis', defaultExpanded: false, order: 3 },
  { key: 'indexing',        label: 'Indexing',           defaultExpanded: false, order: 4 },
  { key: 'ambientContext',  label: 'Ambient Context',   defaultExpanded: false, order: 5 },
];
```

## PromptService Changes

### `stripPromptMeta()`

New private method. Called in `loadOverride()` after reading vault file content, before caching. The stripped template (not the raw file) is what gets compiled and rendered.

### `createOverrideFile(id: TemplateId)`

New public method for the UI to call (accepts `TemplateId`, not just `PromptId`, because system prompts like `doc-polish-system` are registered in `TemplateRegistry` as string IDs outside the `PromptId` enum):
1. Get metadata from `TemplateRegistry.getTemplateMetadata(id)`
2. Get default content from `TemplateManager.getTemplate(id)`
3. Get variable names from `PromptVariables[id]` (if exists)
4. Build prompt-meta YAML block
5. Write to vault: `{promptFolder}/{id}.prompt.md`
6. Return the vault file path

### `checkOverrideExists(id: TemplateId): boolean`

New public method. Checks if `{promptFolder}/{id}.prompt.md` exists in vault.

### `deleteOverride(id: TemplateId)`

New public method. Deletes the override file and clears cache entries.

### `scanOverrides(): Map<string, boolean>`

New public method. Scans `{promptFolder}/` directory for all `.prompt.md` files and returns a map of id → exists. Used by the modal on init to populate override status without N individual file checks.

## New Files

| File | Purpose |
|------|---------|
| `src/ui/view/prompt-template/PromptTemplateModal.tsx` | Obsidian Modal wrapper + ReactRenderer |
| `src/ui/view/prompt-template/PromptTemplateList.tsx` | Main list component: groups, search, footer |
| `src/ui/view/prompt-template/components/PromptGroupSection.tsx` | Collapsible group header + item list |
| `src/ui/view/prompt-template/components/PromptItem.tsx` | Single prompt row with sub-items, tooltip, reset |

## Modified Files

| File | Change |
|------|--------|
| `src/core/template/TemplateRegistry.ts` | Add `label`, `description`, `group` to `TemplateMetadata`; populate for all 63 active prompts; add `PromptGroup` type and `PROMPT_GROUPS` config |
| `src/service/prompt/PromptService.ts` | Add `stripPromptMeta()`, `createOverrideFile()`, `checkOverrideExists()`, `deleteOverride()`, `scanOverrides()` |
| `src/service/prompt/PromptId.ts` | Remove 5 dead PromptIds: `AiAnalysisOverviewRegenerate`, `DocSuggestLinks`, `VaultKnowledgeGaps`, `VaultSynthesize`, `WritingAddEvidence` |
| `src/app/commands.ts` (or equivalent) | Register `Open Prompt Templates` command |

## Not Changed

- `TemplateManager` — no changes, override logic is in PromptService layer
- All prompt consumers (agents, slots, copilot actions) — `render()` interface unchanged
- Settings UI — this is a separate entry point
- Template files on disk — read-only source of truth

## Design Decisions

1. **Modal, not settings tab**: Prompt management is a distinct workflow (discover → override → edit). It doesn't fit the settings pattern of "configure values."
2. **Vault files for editing**: Prompt templates can be hundreds of lines with complex Handlebars syntax. Obsidian's editor with syntax highlighting is the right tool. The modal is just a directory.
3. **prompt-meta as documentation**: The meta block is for the user's benefit while editing. The runtime strips it deterministically. No YAML parser dependency at runtime.
4. **System/user sub-items**: Paired prompts are visually grouped but independently overridable. The parent dot shows aggregate status at a glance.
5. **No in-modal editing**: Keeps the modal simple and focused. All editing happens in Obsidian where users are already comfortable.

## Mockup

See `docs/mockups/prompt-template-modal.html` — open in browser for interactive preview.
