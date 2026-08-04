/**
 * Prompt template definition.
 */
export interface PromptTemplate {
	/** Template text with {{variable}} placeholders */
	template: string;
	/** Whether this prompt expects JSON output */
	expectsJson?: boolean;
	/** Additional instructions for JSON output (e.g., "Return only JSON array") */
	jsonConstraint?: string;
}

/**
 * Centralized prompt identifier enum.
 * All prompts used across the application should be registered here.
 */
export enum PromptId {
	// Chat prompts
	ConversationSystem = 'conversation-system', // todo we need to tell the model. that we have [[xxx]] @xxx@ /xxx/ tags syntax. to let it know he can read these things.
	ConversationSummaryShort = 'conversation-summary-short',
	ConversationSummaryFull = 'conversation-summary-full',
	ProjectSummaryShort = 'project-summary-short',
	ProjectSummaryFull = 'project-summary-full',

	/** Query Rewrite: system prompt for behavior-driven structured query suggestions. */
	QueryRewriteSystem = 'query-rewrite-system',
	/** Query Rewrite: user prompt carrying behavior context + task. */
	QueryRewrite = 'query-rewrite',

	// Application prompts (title generation)
	ApplicationGenerateTitle = 'application-generate-title',

	// Memory/Profile prompts
	MemoryExtractCandidatesJson = 'memory-extract-candidates-json',

	/** One-sentence short summary (preferred for indexing). */
	DocSummaryShort = 'doc-summary-short',
	/** Long-form summary; may use short summary + TextRank anchors. */
	DocSummaryFull = 'doc-summary-full',
	ImageDescription = 'image-description',
	ImageSummary = 'image-summary',
	/** Topic + functional + context tags and optional vault document-type classification (same JSON). */
	DocTagGenerateJson = 'doc-tag-generate-json',
	/** Pattern discovery agent: analyze query history → new query templates. */
	PatternDiscovery = 'pattern-discovery',

	/** System: Knowledge intuition — plan step (tools optional). */
	KnowledgeIntuitionPlanSystem = 'knowledge-intuition-plan-system',
	/** User: backbone + folder digest + document shortlist for intuition planning. */
	KnowledgeIntuitionPlan = 'knowledge-intuition-plan',
	/** User: memory + tool results for intuition submit. */
	KnowledgeIntuitionSubmit = 'knowledge-intuition-submit',

	/** System: Hub curation plan step. */
	HubCurationPlan = 'hub-curation-plan',
	/** User: submit hub curation JSON. */
	HubCurationSubmit = 'hub-curation-submit',
	/** System: Hub materialization draft. */
	HubMaterializationDraft = 'hub-materialization-draft',
	/** System: Hub materialization critique (subagent). */
	HubMaterializationCritique = 'hub-materialization-critique',
	/** System: Copilot Command Center capability plan drafting. */
	CopilotCommandCenterPlan = 'copilot-command-center-plan',

	// Search prompts
	// AI analysis title (generated at end of analysis; used for save/recent/folder suggestion)
	AiAnalysisTitle = 'ai-analysis-title',
	/** Mermaid fix: system. */
	AiAnalysisMermaidFixSystem = 'ai-analysis-mermaid-fix-system',
	/** Mermaid fix: user prompt. */
	AiAnalysisMermaidFix = 'ai-analysis-mermaid-fix',
	/** Unified follow-up user prompt (Summary, Graph, Sources, Blocks, Full). Caller builds contextContent. */
	AiAnalysisFollowup = 'ai-analysis-followup',
	/** System prompt for all follow-up chats (Topic, Continue, Graph, Blocks, Sources). */
	AiAnalysisFollowupSystem = 'ai-analysis-followup-system',
	// AI analysis save dialog (filename/folder suggestions)
	AiAnalysisSaveFileName = 'ai-analysis-save-filename',
	AiAnalysisSaveFolder = 'ai-analysis-save-folder',

	// Vault pipeline prompts (VaultSearchAgent phases)
	/** Vault report executive summary: system (static). */
	AiAnalysisVaultReportSummarySystem = 'ai-analysis-vault-report-summary-system',
	/** Vault report executive summary: user prompt with blocks + evidence. Generated after blocks complete. */
	AiAnalysisVaultReportSummary = 'ai-analysis-vault-report-summary',
	/** Per-section report generation: system (static). */
	AiAnalysisReportSectionSystem = 'ai-analysis-report-section-system',
	/** Per-section report generation: user prompt with evidence + section spec. */
	AiAnalysisReportSection = 'ai-analysis-report-section',
	/** Vault Harness playbook: system prompt for the Peak-owned vault search loop. */
	VaultHarnessPlaybook = 'ai-analysis-vault-harness-playbook',
	/** Nudge injected when the vault agent writes a planning turn but no tool call, prodding it to proceed. */
	AiAnalysisProceedNudge = 'ai-analysis-proceed-nudge',
	/** Continue analysis: system prompt for follow-up rounds. */
	AiAnalysisContinueSystem = 'ai-analysis-continue-system',
	/** Continue analysis: user prompt with previous round context. */
	AiAnalysisContinue = 'ai-analysis-continue',
	/** Synthesize all rounds: system prompt for merging rounds into unified report. */
	AiAnalysisSynthesizeSystem = 'ai-analysis-synthesize-system',
	/** Synthesize all rounds: user prompt with all round data. */
	AiAnalysisSynthesize = 'ai-analysis-synthesize',

	// Context building templates (internal use)
	ContextMemory = 'context-memory',
	UserProfileContext = 'user-profile-context',
	/** Extract user profile items from vault content (build user profile command) */
	ProfileFromVaultJson = 'profile-from-vault-json',
	/** Organize current user profile into clean markdown */
	UserProfileOrganizeMarkdown = 'user-profile-organize-markdown',
	MessageResources = 'message-resources',

	// Copilot Document Intelligence
	DocFormatPolish = 'doc-format-polish',
	DocPolish = 'doc-polish',
	DocReview = 'doc-review',
	DocSplitSuggestion = 'doc-split-suggestion',
	DocSuggestTags = 'doc-suggest-tags',
	DocSummarize = 'doc-summarize',
	DocExtractConcepts = 'doc-extract-concepts',
	DocTranslate = 'doc-translate',
	DocCorrectContent = 'doc-correct-content',

	// Composer text-block transforms
	ComposerProseTransform = 'composer-prose-transform',
	ComposerBlockDraft = 'composer-block-draft',

	// Composer packs (WP5: frontmatter + math)
	ComposerSuggestProperties = 'composer-suggest-properties',
	ComposerExplainFormula = 'composer-explain-formula',
	ComposerSplitFormula = 'composer-split-formula',
	ComposerFormulaVariables = 'composer-formula-variables',

	// Composer packs (WP6: table + chart AI — typed table-patch / chart-source)
	DocTableSummarize = 'doc-table-summarize',
	DocTableAddColumn = 'doc-table-add-column',
	DocTableCheckUnits = 'doc-table-check-units',
	DocTableExtractFormula = 'doc-table-extract-formula',
	DocTableGenerateChart = 'doc-table-generate-chart',

	// Composer packs (WP8/WP-INT: native objects — specialized edit prompts that
	// replace the borrowed doc-polish binding)
	DocMermaidEdit = 'doc-mermaid-edit',
	DocCodeEdit = 'doc-code-edit',
	/** Read-only explanation for code and Mermaid sources. */
	DocNativeExplain = 'doc-native-explain',
	DocLinkTidy = 'doc-link-tidy',
	/** Native structural edit (Base / Canvas / Excalidraw) → typed native-file patch JSON. */
	DocNativeEdit = 'doc-native-edit',

	// Composer packs (WP7: image caption + smart layout — text-port flows)
	ComposerImageCaption = 'composer-image-caption',
	ComposerImageLayout = 'composer-image-layout',

	// Copilot Vault Intelligence
	VaultHealth = 'vault-health',
	VaultSummary = 'vault-summary',

	// Copilot Writing Assistance
	WritingContinue = 'writing-continue',
	WritingRewrite = 'writing-rewrite',

	// Copilot Agent Playbooks
	CopilotAgentSuggestLinks = 'copilot-agent-suggest-links',
	CopilotAgentKnowledgeGaps = 'copilot-agent-knowledge-gaps',
	CopilotAgentSynthesizeTopic = 'copilot-agent-synthesize-topic',
	CopilotAgentAddEvidence = 'copilot-agent-add-evidence',
	CopilotAgentWritingPlan = 'copilot-agent-writing-plan',
	CopilotAgentWriteArticle = 'copilot-agent-write-article',
	CopilotAgentDetectAndFile = 'copilot-agent-detect-and-file',
	CopilotAgentCheckTaskList = 'copilot-agent-check-task-list',
	CopilotAgentPromptAudit = 'copilot-agent-prompt-audit',

	// Chat intelligence
	ChatTopicAggregation = 'chat-topic-aggregation',
	ChatSuggestFollowups = 'chat-suggest-followups',
	ChatSuggestActions = 'chat-suggest-actions',
	ChatAssistantDraft = 'chat-assistant-draft',
	ProjectDescriptionDraft = 'project-description-draft',

	// Ambient context / session intelligence
	WorkingThemeInference = 'working-theme-inference',
	WorkingContextRender = 'working-context-render',
	ActivityIndexRender = 'activity-index-render',

	// Structural analysis
	GapExplanation = 'gap-explanation',

	// Prompt enhancement
	PromptEnhance = 'prompt-enhance',

	// Ambient explanation (LLM micro-explanation for ambient push notes)
	AmbientExplanationSystem = 'ambient-explanation-system',
	AmbientExplanationUser = 'ambient-explanation-user',

	// Copilot Auto Review meta-agent (subject = single note)
	CopilotMetaAgentSystemBase = 'copilot-meta-agent-system-base',
	CopilotMetaAgentFastModeSuffix = 'copilot-meta-agent-fast-mode-suffix',
	CopilotMetaAgentCompleteModeSuffix = 'copilot-meta-agent-complete-mode-suffix',

	// Vault Review meta-agent (subject = whole vault)
	VaultMetaAgentSystemBase = 'vault-meta-agent-system-base',
	VaultMetaAgentFastModeSuffix = 'vault-meta-agent-fast-mode-suffix',
	VaultMetaAgentCompleteModeSuffix = 'vault-meta-agent-complete-mode-suffix',

	// Insight inline chat (per-insight follow-up / draft-proposal modes)
	InsightInlineChatDraftProposalSystem = 'insight-inline-chat-draft-proposal-system',
	InsightInlineChatFollowupSystem = 'insight-inline-chat-followup-system',

	// Knowledge graph agent (search → graph structure)
	GraphAgentSystem = 'graph-agent-system',
	GraphAgentUser = 'graph-agent-user',
	/** Typed heterogeneous node/relation extraction for canonical AI Graph artifacts. */
	AIGraphArtifactExtractSystem = 'ai-graph-artifact-extract-system',
	AIGraphArtifactExtract = 'ai-graph-artifact-extract',

	// Thinking-tree inference (document hierarchy from titles + first lines)
	GraphInferThinkingTreeSystem = 'graph-infer-thinking-tree-system',
	GraphInferThinkingTreeUser = 'graph-infer-thinking-tree-user',

	// Report orchestrator: assign user insights to plan sections
	ReportAssignInsights = 'report-assign-insights',

	// Curator (agent harness setup): recommend model bindings
	CuratorSystem = 'curator-system',

	// Usage optimization: rank cost-saving recommendations
	UsageOptimizationSystem = 'usage-optimization-system',

	// Copilot action: find vault tasks that look like open questions and solve them
	CopilotFindAndSolveTasksSystem = 'copilot-find-and-solve-tasks-system',
	CopilotFindAndSolveTasksUser = 'copilot-find-and-solve-tasks-user',

	// Lint insights (vault-health LintFinding → AI repair prompts)
	LintBrokenLinkRepair = 'lint-broken-link-repair',
	LintMissingTargets = 'lint-missing-targets',
	LintNoiseSource = 'lint-noise-source',
	LintOrphanReconnect = 'lint-orphan-reconnect',
	LintTagCoverage = 'lint-tag-coverage',
	LintContentCleanup = 'lint-content-cleanup',

	// Web search MCP tool / chat web search tool (shared)
	WebSearchToolSystem = 'web-search-tool-system',

	// Plan mode (chat) system prompt prepended in plan conversation mode
	PlanModeSystem = 'plan-mode-system',

	// Built-in skills (full skill markdown including frontmatter)
	SkillWeeklyReport = 'skill-weekly-report',
	SkillLiteratureReview = 'skill-literature-review',
	SkillVaultHealthCheck = 'skill-vault-health-check',
}

/**
 * Variable schemas for each prompt type.
 * Used for type-safe rendering.
 * // todo some prompts may have expected output format, we should add it to the interface. maybe turn into an agent
 */
export interface PromptVariables {
	[PromptId.ConversationSystem]: {
		capabilities?: {
			webSearchAvailable: boolean;
			webSearchEnabled: boolean;
			vaultSearchAvailable: boolean;
			vaultSearchEnabled: boolean;
		};
		richOutputTypes?: Array<{
			id: string;
			label: string;
			renderer: 'native' | 'source-only';
			conventionMarkdown: string;
		}>;
	};
	[PromptId.ConversationSummaryShort]: {
		messages: Array<{ role: string; content: string }>;
		projectContext?: string;
	};
	[PromptId.ConversationSummaryFull]: {
		messages: Array<{ role: string; content: string }>;
		projectContext?: string;
		shortSummary?: string;
	};
	[PromptId.ProjectSummaryShort]: {
		conversations: Array<{ title: string; shortSummary?: string }>;
		resources?: Array<{ title: string; source: string }>;
	};
	[PromptId.ProjectSummaryFull]: {
		conversations: Array<{ title: string; shortSummary?: string; fullSummary?: string }>;
		resources?: Array<{ title: string; source: string; shortSummary?: string }>;
		shortSummary?: string;
	};
	[PromptId.ApplicationGenerateTitle]: {
		messages: Array<{ role: string; content: string }>;
		contextInfo?: string;
	};
	[PromptId.MemoryExtractCandidatesJson]: {
		userMessage: string;
		assistantReply: string;
		context?: Record<string, string>;
	};
	[PromptId.DocSummaryShort]: {
		content: string;
		title?: string;
		path?: string;
		/** Target length hint (words), for template `maxWords`. */
		maxWords?: string;
		/** Comma-separated TextRank terms. */
		textrankKeywords?: string;
		/** Numbered extractive sentences from TextRank. */
		textrankSentences?: string;
	};
	[PromptId.DocSummaryFull]: {
		content: string;
		title?: string;
		path?: string;
		targetWords?: string;
		shortSummary?: string;
		textrankKeywords?: string;
		textrankSentences?: string;
	};
	[PromptId.ImageDescription]: Record<string, never>;
	[PromptId.ImageSummary]: {
		content: string;
		title?: string;
		path?: string;
	};
	[PromptId.KnowledgeIntuitionPlanSystem]: Record<string, never>;
	[PromptId.KnowledgeIntuitionPlan]: {
		userGoal: string;
		vaultName: string;
		currentDateLabel: string;
		vaultSummaryMarkdown: string;
		baselineExcludedMarkdown: string;
		backboneMarkdownExcerpt: string;
		backboneEdgesMarkdown: string;
		folderSignalsMarkdown: string;
		documentShortlistMarkdown: string;
		folderTreeMarkdown: string;
	};
	[PromptId.KnowledgeIntuitionSubmit]: {
		userGoal: string;
		iteration: number;
		memoryJson: string;
		/** Deterministic counts for dynamic entry-point breadth. */
		vaultScaleHintMarkdown: string;
		folderTreeMarkdown: string;
		backboneEdgesJson: string;
		toolResultsMarkdown: string;
	};
	[PromptId.HubCurationPlan]: {
		vaultName: string;
		currentDateLabel: string;
		worldSnapshotMarkdown: string;
	};
	[PromptId.HubCurationSubmit]: Record<string, never>;
	[PromptId.HubMaterializationDraft]: {
		vaultName: string;
		hubNodeId: string;
		hubPath: string;
		curatorReason: string;
		coreMembers: Array<{
			path: string;
			title: string;
			pagerank: string;
			betweenness: string;
			tagsCsv: string;
			excerpt: string;
		}>;
		fringeMembers: Array<{ path: string; title: string }>;
		aggregatedTagsCsv: string;
		aggregatedKeywordsCsv: string;
		previousGaps: Array<{ memberId: string; kind: string; hint: string }>;
	};
	[PromptId.HubMaterializationCritique]: {
		hubPath: string;
		memberCount: number;
		coreCount: number;
		fringeCount: number;
		draftMarkdown: string;
		referencedMemberIds: string[];
	};
	[PromptId.CopilotCommandCenterPlan]: {
		userGoal: string;
		activeFilePath: string;
		activeFileExcerpt: string;
		availableCommands: Array<{ commandId: string; commandLabel: string; description: string }>;
	};
	[PromptId.DocTagGenerateJson]: {
		content: string;
		title?: string;
		/** Comma-separated topic hints (optional). */
		existingTopicTags?: string;
		/** Comma-separated user #tags / frontmatter tags (hints only). */
		existingUserTags?: string;
		/** TextRank top terms (comma-separated). */
		textrankKeywords?: string;
		/** TextRank numbered sentences. */
		textrankSentences?: string;
		/** Bullet list: dimension → allowed functional tag ids. */
		functionalHintsTable: string;
		/** Comma-separated functional tag ids for the prompt body. */
		functionalTagList: string;
	};
	/** originalQuery, question, contextContent (caller builds based on section). */
	[PromptId.AiAnalysisFollowup]: { originalQuery: string; question: string; contextContent: string };
	/** System prompt for all follow-up chats; no variables. */
	[PromptId.AiAnalysisFollowupSystem]: Record<string, never>;

	[PromptId.AiAnalysisMermaidFixSystem]: Record<string, never>;
	[PromptId.AiAnalysisMermaidFix]: {
		brokenMermaid: string;
		errorMessage: string;
	};

	[PromptId.AiAnalysisTitle]: { query: string; summary?: string };

	[PromptId.AiAnalysisSaveFileName]: { query: string; summary?: string };
	[PromptId.AiAnalysisSaveFolder]: { query: string; summary?: string; candidateFoldersFromSearch?: string; defaultSaveFolder?: string };
	[PromptId.ContextMemory]: {
		hasProject: boolean;
		projectName: string;
		projectSummary: string;
		projectResources: Array<{
			displayName: string;
			displaySummary: string;
		}>;
		hasConversation: boolean;
		conversationSummary: string;
		conversationTopics: string[];
		conversationResources: Array<{
			displayName: string;
			displaySummary: string;
		}>;
	};
	[PromptId.UserProfileContext]: {
		contextEntries: Array<{
			category: string;
			texts: string;
		}>;
	};
	[PromptId.ProfileFromVaultJson]: {
		vaultContent: string;
		existingProfileMarkdown?: string;
	};
	[PromptId.UserProfileOrganizeMarkdown]: {
		currentProfileMarkdown: string;
		newItemsMarkdown?: string;
	};
	[PromptId.MessageResources]: {
		resources: Array<{
			id: string;
		}>;
	};

	// Vault pipeline
	[PromptId.AiAnalysisVaultReportSummarySystem]: Record<string, never>;
	[PromptId.AiAnalysisVaultReportSummary]: {
		userQuery: string;
		reportPlan: string;
		sections: Array<{ title: string; content: string }>;
		evidenceList: string;
	};
	[PromptId.AiAnalysisProceedNudge]: Record<string, never>;
	[PromptId.AiAnalysisContinueSystem]: Record<string, never>;
	[PromptId.AiAnalysisContinue]: {
		originalQuery: string;
		rounds: Array<{
			query: string;
			summary: string;
			sections: Array<{ title: string; content: string }>;
			annotations: Array<{ sectionTitle: string; selectedText?: string; comment: string; type: string }>;
		}>;
		sources: Array<{ path: string; relevance?: string }>;
		graphSummary?: { nodeCount: number; keyRelationships: string[] } | null;
		followUpQuery: string;
	};
	[PromptId.AiAnalysisSynthesizeSystem]: Record<string, never>;
	[PromptId.AiAnalysisSynthesize]: {
		rounds: Array<{
			query: string;
			summary: string;
			sections: Array<{ title: string; content: string }>;
			annotations: Array<{ type: string; sectionTitle: string; comment: string }>;
		}>;
	};
	[PromptId.AiAnalysisReportSectionSystem]: Record<string, never>;
	[PromptId.AiAnalysisReportSection]: {
		userQuery: string;
		reportOverview: string;
		sectionTitle: string;
		contentType: string;
		visualType: string;
		sectionBrief: string;
		otherSections: string;
		evidenceContent: string;
		userPrompt?: string;
		missionRole: string;
		userNotes?: string;
	};

	// Pattern discovery
	[PromptId.PatternDiscovery]: {
		availableVariables: string;
		availableConditions: string;
		queriesJson: string;
		existingPatternsJson: string;
		vaultStructureJson: string;
	};
	[PromptId.DocFormatPolish]: {
		content: string;
		title?: string;
		scope: 'full' | 'selection';
	};
	[PromptId.DocPolish]: {
		content: string;
		title?: string;
		scope: 'full' | 'selection';
		instruction?: string;
	};
	[PromptId.DocReview]: {
		content: string;
		title?: string;
		scope: 'full' | 'selection';
	};
	[PromptId.DocSplitSuggestion]: {
		content: string;
		title?: string;
		wordCount: number;
	};
	[PromptId.DocSuggestTags]: {
		content: string;
		title?: string;
	};
	[PromptId.DocSummarize]: {
		content: string;
		title?: string;
		scope: string;
		length: string;
	};
	[PromptId.DocExtractConcepts]: {
		content: string;
		title?: string;
	};
	[PromptId.DocTranslate]: {
		content: string;
		title?: string;
		scope: string;
		targetLanguage: string;
	};
	[PromptId.DocCorrectContent]: {
		content: string;
		title?: string;
		scope: 'full' | 'selection';
	};
	[PromptId.ComposerProseTransform]: {
		content: string;
		before?: string;
		after?: string;
		blockKind: string;
		instruction: string;
	};
	[PromptId.ComposerBlockDraft]: {
		instruction: string;
		targetSource: string;
		before?: string;
		after?: string;
	};
	[PromptId.ComposerSuggestProperties]: {
		content: string;
		title?: string;
		currentProperties: string;
		instruction?: string;
	};
	[PromptId.ComposerExplainFormula]: {
		latex: string;
		label?: string;
		instruction?: string;
	};
	[PromptId.ComposerSplitFormula]: {
		latex: string;
		label?: string;
		instruction?: string;
	};
	[PromptId.ComposerFormulaVariables]: {
		latex: string;
		label?: string;
		instruction?: string;
	};
	[PromptId.DocTableSummarize]: {
		table: string;
		instruction?: string;
	};
	[PromptId.DocTableAddColumn]: {
		table: string;
		instruction?: string;
	};
	[PromptId.DocTableCheckUnits]: {
		table: string;
		instruction?: string;
	};
	[PromptId.DocTableExtractFormula]: {
		table: string;
		instruction?: string;
	};
	[PromptId.DocTableGenerateChart]: {
		table: string;
		instruction?: string;
	};
	[PromptId.DocMermaidEdit]: {
		content: string;
		scope: 'full' | 'selection';
		instruction?: string;
	};
	[PromptId.DocCodeEdit]: {
		content: string;
		scope: 'full' | 'selection';
		/** Fenced-code language token, when known (kept stable across the edit). */
		language?: string;
		instruction?: string;
	};
	[PromptId.DocNativeExplain]: {
		content: string;
		nativeKind: 'code' | 'mermaid';
		language?: string;
		instruction?: string;
	};
	[PromptId.DocLinkTidy]: {
		content: string;
		scope: 'full' | 'selection';
		instruction?: string;
	};
	[PromptId.DocNativeEdit]: {
		/** Native object format — selects the typed-patch schema in the system prompt. */
		format: 'base' | 'canvas' | 'excalidraw';
		/** Verbatim current bytes of the native object file (or its editable slice). */
		native: string;
		instruction?: string;
	};
	[PromptId.ComposerImageCaption]: {
		/** Frozen image block source (embed + any surrounding figure markup). */
		context: string;
		instruction?: string;
	};
	[PromptId.ComposerImageLayout]: {
		/** JSON list of the selected image items ({ path, alt?, caption? }[]). */
		items: string;
		instruction?: string;
	};
	[PromptId.VaultHealth]: {
		stats: string;
	};
	[PromptId.VaultSummary]: {
		period: string;
		noteList: string;
	};
	[PromptId.WritingContinue]: {
		content: string;
		title?: string;
	};
	[PromptId.WritingRewrite]: {
		selection: string;
		content: string;
		title?: string;
		style: string;
	};

	// Copilot Agent Playbooks
	[PromptId.CopilotAgentSuggestLinks]: Record<string, never>;
	[PromptId.CopilotAgentKnowledgeGaps]: Record<string, never>;
	[PromptId.CopilotAgentSynthesizeTopic]: Record<string, never>;
	[PromptId.CopilotAgentAddEvidence]: Record<string, never>;
	[PromptId.CopilotAgentWritingPlan]: Record<string, never>;
	[PromptId.CopilotAgentWriteArticle]: Record<string, never>;
	[PromptId.CopilotAgentDetectAndFile]: Record<string, never>;
	[PromptId.CopilotAgentCheckTaskList]: Record<string, never>;
	[PromptId.CopilotAgentPromptAudit]: Record<string, never>;

	// Chat intelligence
	[PromptId.ChatTopicAggregation]: {
		messages: string; // Pre-formatted message list
	};
	[PromptId.ChatSuggestFollowups]: {
		assistantMessage: string;
		userMessage: string;
	};
	[PromptId.ChatSuggestActions]: {
		messages: string;
	};
	[PromptId.ChatAssistantDraft]: {
		userPrompt: string;
	};
	[PromptId.ProjectDescriptionDraft]: {
		projectName: string;
		generatedSummary: string;
		conversationTitles: string;
		currentDescription: string;
	};

	// Ambient context / session intelligence
	[PromptId.WorkingThemeInference]: {
		activities: Array<{ type: string; summary: string; timestamp: number }>;
	};
	[PromptId.WorkingContextRender]: {
		theme: string;
		recentActivities: Array<{ summary: string; timeAgo: string }>;
		activeFile: { path: string; title: string } | null;
	};
	[PromptId.ActivityIndexRender]: {
		activities: Array<{ id: string; timeAgo: string; summary: string }>;
		counts: Record<string, number>;
	};

	[PromptId.GapExplanation]: {
		communityALabel: string;
		communityBLabel: string;
		gapScore: number;
		potentialBridges: Array<{ sourceLabel: string; targetLabel: string; similarity: number }>;
	};

	[PromptId.PromptEnhance]: {
		userPrompt: string;
	};

	// Ambient explanation
	[PromptId.AmbientExplanationSystem]: Record<string, never>;
	[PromptId.AmbientExplanationUser]: {
		currentParagraph: string;
		pushNoteTitle: string;
		pushNoteExcerpt: string;
	};

	// Copilot Auto Review meta-agent
	[PromptId.CopilotMetaAgentSystemBase]: Record<string, never>;
	[PromptId.CopilotMetaAgentFastModeSuffix]: Record<string, never>;
	[PromptId.CopilotMetaAgentCompleteModeSuffix]: Record<string, never>;

	// Vault Review meta-agent
	[PromptId.VaultMetaAgentSystemBase]: Record<string, never>;
	[PromptId.VaultMetaAgentFastModeSuffix]: Record<string, never>;
	[PromptId.VaultMetaAgentCompleteModeSuffix]: Record<string, never>;

	// Insight inline chat
	[PromptId.InsightInlineChatDraftProposalSystem]: {
		subjectPath: string;
		subjectBasename: string;
		insightTitle: string;
		insightBody: string;
	};
	[PromptId.InsightInlineChatFollowupSystem]: {
		subjectPath: string;
		subjectBasename: string;
		insightTitle: string;
		insightBody: string;
	};

	// Graph agent
	[PromptId.GraphAgentSystem]: {
		searchQuery: string;
		sourcesTable: string;
	};
	[PromptId.GraphAgentUser]: {
		sourceCount: number;
		searchQuery: string;
	};
	[PromptId.AIGraphArtifactExtractSystem]: Record<string, never>;
	[PromptId.AIGraphArtifactExtract]: {
		searchQuery: string;
		graphType: string;
		sourcesText: string;
		currentGraph: string;
	};

	// Thinking-tree inference
	[PromptId.GraphInferThinkingTreeSystem]: Record<string, never>;
	[PromptId.GraphInferThinkingTreeUser]: {
		filesText: string;
	};

	// Report orchestrator: assign insights
	[PromptId.ReportAssignInsights]: {
		sectionList: string;
		insightList: string;
		userQuery: string;
	};

	// Curator
	[PromptId.CuratorSystem]: Record<string, never>;

	// Usage optimization
	[PromptId.UsageOptimizationSystem]: Record<string, never>;

	// Copilot find-and-solve-tasks
	[PromptId.CopilotFindAndSolveTasksSystem]: Record<string, never>;
	[PromptId.CopilotFindAndSolveTasksUser]: {
		taskList: string;
	};

	// Lint insights
	[PromptId.LintBrokenLinkRepair]: {
		topFiles: string;
	};
	[PromptId.LintMissingTargets]: {
		targetLines: string;
		sourceSample: string;
	};
	[PromptId.LintNoiseSource]: {
		folder: string;
		fileLines: string;
	};
	[PromptId.LintOrphanReconnect]: {
		lines: string;
	};
	[PromptId.LintTagCoverage]: {
		lines: string;
	};
	[PromptId.LintContentCleanup]: {
		lines: string;
	};

	// Web search tool
	[PromptId.WebSearchToolSystem]: Record<string, never>;

	// Plan mode
	[PromptId.PlanModeSystem]: Record<string, never>;

	// Built-in skills
	[PromptId.SkillWeeklyReport]: Record<string, never>;
	[PromptId.SkillLiteratureReview]: Record<string, never>;
	[PromptId.SkillVaultHealthCheck]: Record<string, never>;
}

export type PromptInfo = PromptTemplate & { systemPromptId?: PromptId };
