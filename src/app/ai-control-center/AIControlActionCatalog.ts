import type { AIControlProductArea } from '@/core/ports/AIControlCenterPort';
import { PromptId } from '@/core/types/prompt';

export interface RegisteredAIControlAction {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly area: AIControlProductArea;
	/** One LLM call at a time: at most a system and a user/instruction prompt. */
	readonly promptIds: readonly PromptId[];
}

/**
 * Source-backed actions outside the Copilot action runtime. Each entry names
 * a live caller that renders these PromptIds. Background embeddings, caches,
 * deterministic parsers and helper-only templates are intentionally absent.
 */
export const REGISTERED_AI_CONTROL_ACTIONS: readonly RegisteredAIControlAction[] = [
	{ id: 'vault-search-refine-query', label: 'Refine a search query', description: 'Turn the current search and recent browsing context into clearer query candidates.', area: 'search-knowledge', promptIds: [PromptId.QueryRewriteSystem, PromptId.QueryRewrite] },
	{ id: 'ai-search-gather-evidence', label: 'Gather evidence', description: 'Plan and run a Vault research pass before a report is written.', area: 'ai-search-graph', promptIds: [PromptId.VaultHarnessPlaybook] },
	{ id: 'ai-search-generate-report-section', label: 'Generate a report section', description: 'Turn approved evidence into one report section with citations.', area: 'ai-search-graph', promptIds: [PromptId.AiAnalysisReportSectionSystem, PromptId.AiAnalysisReportSection] },
	{ id: 'ai-search-generate-report-summary', label: 'Generate a report summary', description: 'Create the executive summary from the completed report sections.', area: 'ai-search-graph', promptIds: [PromptId.AiAnalysisVaultReportSummarySystem, PromptId.AiAnalysisVaultReportSummary] },
	{ id: 'ai-search-repair-report-diagram', label: 'Repair a report diagram', description: 'Correct Mermaid syntax for a report diagram without changing its intended meaning.', area: 'ai-search-graph', promptIds: [PromptId.AiAnalysisMermaidFixSystem, PromptId.AiAnalysisMermaidFix] },
	{ id: 'ai-search-place-report-insights', label: 'Place report insights', description: 'Assign reviewed insights to the most relevant report section before writing.', area: 'ai-search-graph', promptIds: [PromptId.ReportAssignInsights] },
	{ id: 'ai-search-continue-analysis', label: 'Continue an analysis', description: 'Use earlier reviewed rounds to research a follow-up question without starting over.', area: 'ai-search-graph', promptIds: [PromptId.AiAnalysisContinueSystem, PromptId.AiAnalysisContinue] },
	{ id: 'ai-search-synthesize-rounds', label: 'Synthesize analysis rounds', description: 'Merge reviewed analysis rounds into one coherent result.', area: 'ai-search-graph', promptIds: [PromptId.AiAnalysisSynthesizeSystem, PromptId.AiAnalysisSynthesize] },
	{ id: 'ai-search-ask-results', label: 'Ask about results', description: 'Answer a follow-up question against the evidence already collected in an AI Search result.', area: 'ai-search-graph', promptIds: [PromptId.AiAnalysisFollowupSystem, PromptId.AiAnalysisFollowup] },
	{ id: 'ai-search-suggest-save-location', label: 'Suggest where to save a report', description: 'Suggest a meaningful filename and Vault folder before a person explicitly saves an AI Search result.', area: 'ai-search-graph', promptIds: [PromptId.AiAnalysisSaveFileName, PromptId.AiAnalysisSaveFolder] },
	{ id: 'ai-graph-generate-map', label: 'Generate a relationship map', description: 'Read selected sources and build a relationship map from their topics and links.', area: 'ai-search-graph', promptIds: [PromptId.GraphAgentSystem, PromptId.GraphAgentUser] },
	{ id: 'ai-graph-build-evidence-graph', label: 'Build an evidence graph', description: 'Extract grounded entities, claims and relationships from selected source notes.', area: 'ai-search-graph', promptIds: [PromptId.AIGraphArtifactExtractSystem, PromptId.AIGraphArtifactExtract] },
	{ id: 'ai-graph-organize-thinking-map', label: 'Organize a thinking map', description: 'Arrange a set of notes into a readable hierarchy of themes, bridges and supporting notes.', area: 'ai-search-graph', promptIds: [PromptId.GraphInferThinkingTreeSystem, PromptId.GraphInferThinkingTreeUser] },
	{ id: 'composer-transform-prose', label: 'Transform prose', description: 'Rewrite the current paragraph or selection while preserving the surrounding document.', area: 'composer-copilot', promptIds: [PromptId.ComposerProseTransform] },
	{ id: 'composer-draft-block', label: 'Draft a new block', description: 'Draft one new document block from the person’s current instruction and nearby context.', area: 'composer-copilot', promptIds: [PromptId.ComposerBlockDraft] },
	{ id: 'composer-suggest-properties', label: 'Suggest note properties', description: 'Propose structured frontmatter properties for the current note.', area: 'composer-copilot', promptIds: [PromptId.ComposerSuggestProperties] },
	{ id: 'composer-explain-formula', label: 'Explain a formula', description: 'Explain the selected formula in plain language without changing it.', area: 'composer-copilot', promptIds: [PromptId.ComposerExplainFormula] },
	{ id: 'composer-split-formula', label: 'Break down a formula', description: 'Split a complex formula into understandable parts and intermediate steps.', area: 'composer-copilot', promptIds: [PromptId.ComposerSplitFormula] },
	{ id: 'composer-list-formula-variables', label: 'Explain formula variables', description: 'Identify the variables used in a formula and explain what each one represents.', area: 'composer-copilot', promptIds: [PromptId.ComposerFormulaVariables] },
	{ id: 'composer-summarize-table', label: 'Summarize a table', description: 'Turn the visible table into a concise, source-aware summary.', area: 'composer-copilot', promptIds: [PromptId.DocTableSummarize] },
	{ id: 'composer-add-table-column', label: 'Add a table column', description: 'Propose values for a new table column using the existing rows as context.', area: 'composer-copilot', promptIds: [PromptId.DocTableAddColumn] },
	{ id: 'composer-check-table-units', label: 'Check table units', description: 'Review table values for inconsistent or missing units.', area: 'composer-copilot', promptIds: [PromptId.DocTableCheckUnits] },
	{ id: 'composer-extract-table-formula', label: 'Extract a table formula', description: 'Infer a reusable formula from the selected table values.', area: 'composer-copilot', promptIds: [PromptId.DocTableExtractFormula] },
	{ id: 'composer-generate-chart', label: 'Generate a chart', description: 'Propose a chart definition from the current table data.', area: 'composer-copilot', promptIds: [PromptId.DocTableGenerateChart] },
	{ id: 'composer-tidy-links', label: 'Tidy document links', description: 'Review and improve links in the current document.', area: 'composer-copilot', promptIds: [PromptId.DocLinkTidy] },
	{ id: 'composer-edit-mermaid', label: 'Edit a Mermaid diagram', description: 'Make a structured change to the selected Mermaid diagram.', area: 'composer-copilot', promptIds: [PromptId.DocMermaidEdit] },
	{ id: 'composer-edit-code', label: 'Edit a code block', description: 'Make a structured change to the selected code block.', area: 'composer-copilot', promptIds: [PromptId.DocCodeEdit] },
	{ id: 'composer-explain-embedded-content', label: 'Explain embedded content', description: 'Explain a code block or Mermaid diagram without editing it.', area: 'composer-copilot', promptIds: [PromptId.DocNativeExplain] },
	{ id: 'composer-edit-native-file', label: 'Edit a native file', description: 'Propose a structured change to a supported native file or embedded object.', area: 'composer-copilot', promptIds: [PromptId.DocNativeEdit] },
	{ id: 'composer-describe-image', label: 'Describe an image', description: 'Draft an accessible caption from an image in the current Composer document.', area: 'composer-copilot', promptIds: [PromptId.ComposerImageCaption] },
	{ id: 'composer-arrange-image', label: 'Arrange an image', description: 'Recommend a readable image layout in the current Composer document.', area: 'composer-copilot', promptIds: [PromptId.ComposerImageLayout] },
	{ id: 'copilot-suggest-tags', label: 'Suggest document tags', description: 'Propose tags for the current document from its contents and the existing Vault vocabulary.', area: 'composer-copilot', promptIds: [PromptId.DocSuggestTags] },
	{ id: 'chat-conversation', label: 'Chat conversation', description: 'The base instruction used when Peak answers in Chat Studio.', area: 'chat-generation', promptIds: [PromptId.ConversationSystem] },
	{ id: 'chat-improve-request', label: 'Improve a chat request', description: 'Turn a vague chat request into a clearer instruction before it is sent.', area: 'chat-generation', promptIds: [PromptId.PromptEnhance] },
	{ id: 'chat-suggest-follow-ups', label: 'Suggest follow-up questions', description: 'Offer context-aware next questions below a chat response.', area: 'chat-generation', promptIds: [PromptId.ChatSuggestFollowups] },
	{ id: 'chat-draft-assistant', label: 'Draft a chat assistant', description: 'Turn a plain-language request into an editable Chat Assistant definition.', area: 'chat-generation', promptIds: [PromptId.ChatAssistantDraft] },
	{ id: 'chat-draft-project-description', label: 'Draft a project description', description: 'Draft an editable description for the current Chat project.', area: 'chat-generation', promptIds: [PromptId.ProjectDescriptionDraft] },
	{ id: 'chat-plan-conversation', label: 'Plan a conversation', description: 'Add planning guidance when a person explicitly starts a Chat plan.', area: 'chat-generation', promptIds: [PromptId.PlanModeSystem] },
	{ id: 'chat-search-the-web', label: 'Search the web in chat', description: 'Set the instruction used when Chat delegates a question to web search.', area: 'chat-generation', promptIds: [PromptId.WebSearchToolSystem] },
	{ id: 'chat-build-profile', label: 'Build a profile from the Vault', description: 'Extract reviewable profile facts from the notes a person chooses.', area: 'chat-generation', promptIds: [PromptId.ProfileFromVaultJson] },
	{ id: 'chat-organize-profile', label: 'Organize a profile', description: 'Turn reviewed profile facts into a readable profile proposal.', area: 'chat-generation', promptIds: [PromptId.UserProfileOrganizeMarkdown] },
	{ id: 'ambient-explain-suggestion', label: 'Explain an ambient suggestion', description: 'Explain briefly why a surfaced note may matter to the person’s current work.', area: 'chat-generation', promptIds: [PromptId.AmbientExplanationSystem, PromptId.AmbientExplanationUser] },
	{ id: 'vault-discover-patterns', label: 'Discover knowledge patterns', description: 'Plan an exploration of recurring themes, gaps and useful entry points across the Vault.', area: 'vault-intelligence', promptIds: [PromptId.KnowledgeIntuitionPlanSystem, PromptId.KnowledgeIntuitionPlan] },
	{ id: 'vault-submit-patterns', label: 'Summarize knowledge patterns', description: 'Turn the completed exploration into structured, reviewable themes and entry points.', area: 'vault-intelligence', promptIds: [PromptId.KnowledgeIntuitionSubmit] },
	{ id: 'vault-curate-hubs', label: 'Propose knowledge hubs', description: 'Recommend which related notes should be grouped into a navigable Hub.', area: 'vault-intelligence', promptIds: [PromptId.HubCurationPlan] },
	{ id: 'vault-submit-hub-proposal', label: 'Finalize a hub proposal', description: 'Turn the hub curation work into a structured, reviewable set of Hub proposals.', area: 'vault-intelligence', promptIds: [PromptId.HubCurationSubmit] },
	{ id: 'vault-draft-hub', label: 'Draft a knowledge hub', description: 'Prepare the content for a Hub preview before the person explicitly materializes it as a note.', area: 'vault-intelligence', promptIds: [PromptId.HubMaterializationDraft] },
	{ id: 'vault-check-hub-draft', label: 'Check a hub draft', description: 'Review a Hub draft for missing source coverage before it can be materialized.', area: 'vault-intelligence', promptIds: [PromptId.HubMaterializationCritique] },
	{ id: 'vault-review-note-quickly', label: 'Quickly review a note', description: 'Run the focused Auto Review mode for the current note.', area: 'vault-intelligence', promptIds: [PromptId.CopilotMetaAgentSystemBase, PromptId.CopilotMetaAgentFastModeSuffix] },
	{ id: 'vault-review-note-thoroughly', label: 'Thoroughly review a note', description: 'Run the complete Auto Review mode for the current note.', area: 'vault-intelligence', promptIds: [PromptId.CopilotMetaAgentSystemBase, PromptId.CopilotMetaAgentCompleteModeSuffix] },
	{ id: 'vault-review-vault-quickly', label: 'Quickly review the Vault', description: 'Run the focused Vault Review mode over the selected Vault context.', area: 'vault-intelligence', promptIds: [PromptId.VaultMetaAgentSystemBase, PromptId.VaultMetaAgentFastModeSuffix] },
	{ id: 'vault-review-vault-thoroughly', label: 'Thoroughly review the Vault', description: 'Run the complete Vault Review mode over the selected Vault context.', area: 'vault-intelligence', promptIds: [PromptId.VaultMetaAgentSystemBase, PromptId.VaultMetaAgentCompleteModeSuffix] },
	{ id: 'vault-draft-insight-change', label: 'Draft a change from an insight', description: 'Turn an Auto Review insight into one or more reviewable document changes.', area: 'vault-intelligence', promptIds: [PromptId.InsightInlineChatDraftProposalSystem] },
	{ id: 'vault-ask-about-insight', label: 'Ask about an insight', description: 'Follow up on an Auto Review insight without changing the document.', area: 'vault-intelligence', promptIds: [PromptId.InsightInlineChatFollowupSystem] },
	{ id: 'vault-repair-broken-links', label: 'Plan broken-link repairs', description: 'Create reviewable repairs for broken links found in Vault Health.', area: 'vault-intelligence', promptIds: [PromptId.LintBrokenLinkRepair] },
	{ id: 'vault-repair-missing-targets', label: 'Plan missing-target repairs', description: 'Map or propose missing link targets found in Vault Health.', area: 'vault-intelligence', promptIds: [PromptId.LintMissingTargets] },
	{ id: 'vault-reduce-link-noise', label: 'Review link noise', description: 'Classify noisy links so the person can review cleanup suggestions.', area: 'vault-intelligence', promptIds: [PromptId.LintNoiseSource] },
	{ id: 'vault-reconnect-orphan-note', label: 'Reconnect an orphan note', description: 'Propose grounded links for a note that is isolated from the Vault.', area: 'vault-intelligence', promptIds: [PromptId.LintOrphanReconnect] },
	{ id: 'vault-improve-tag-coverage', label: 'Improve tag coverage', description: 'Suggest tags for a Vault Health finding with missing coverage.', area: 'vault-intelligence', promptIds: [PromptId.LintTagCoverage] },
	{ id: 'vault-clean-up-note-content', label: 'Plan note cleanup', description: 'Suggest a reviewable cleanup for an empty or incomplete note.', area: 'vault-intelligence', promptIds: [PromptId.LintContentCleanup] },
];
