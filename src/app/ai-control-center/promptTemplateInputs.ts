import type { AIControlPromptInput } from '@/core/ports/AIControlCenterPort';

/**
 * The editor shows the fields which are actually referenced by the template.
 * A field's value is supplied by the action at runtime; these descriptions do
 * not invent editable settings or expose the action's internal data store.
 */
const DESCRIPTIONS: Record<string, string> = {
	currentQuery: 'The exact words currently entered in Vault Search. Use this as the main subject for a clearer or broader query.',
	activeFilePath: 'The path of the note currently open in Obsidian. It is contextual only and can be absent when search was opened without a note.',
	currentResultView: 'The results view the person is currently looking at. It describes browsing state, not source evidence.',
	recentQueriesLine: 'A compact list of recent searches in this session, used to avoid repeating wording the person has already tried.',
	recentOpenedFilesLine: 'Recently opened notes. This is optional context, not evidence the answer may claim.',
	pinnedLine: 'Notes or results the person explicitly pinned while searching. It is present only when something was pinned.',
	knownTopFoldersLine: 'A short list of top-level Vault folders, used to keep folder-aware suggestions grounded in existing locations.',
	typedTrail: 'How the search query changed while the person typed, helping the suggestion avoid abandoned wording.',
	firstScreenLine: 'A compact description of the first results already visible, used to judge whether the query is too broad or narrow.',
	eventCount: 'The number of relevant interactions in this search session. It gives session depth, never document content.',
	sessionTimeline: 'An ordered summary of search edits, opens and pins in this session. It captures intent progression without becoming a chat transcript.',
	content: 'The current content of the selected document or block. Peak supplies it at runtime; it is not typed into this field manually.',
	selection: 'The text currently selected by the person. It can be empty when the action was started without a selection.',
	title: 'The title of the current document or source item.',
	scope: 'Whether the action received the whole document or only the current selection.',
	tags: 'The current document tags, supplied as context for the action.',
	wordCount: 'The current document word count, used only when the action needs a size-aware instruction.',
	length: 'The requested response length supplied by the owning action.',
	targetLanguage: 'The destination language selected for a translation action.',
	searchQuery: 'The question or topic that started this search or graph request.',
	sourcesText: 'A bounded, structured extract of the source notes selected for this run. It is the evidence available to the action.',
	sourceCount: 'The number of selected source notes. It is a count only, not source content.',
	sourcesTable: 'A structured list of source metadata supplied to the graph action.',
	graphType: 'The graph view requested by the person, such as concept, evidence, causal or timeline.',
	currentGraph: 'The current saved graph snapshot, supplied only when the action is updating an existing graph.',
	filesText: 'A bounded list of note paths, titles and opening lines used to organise a thinking map.',
	originalQuery: 'The original AI Search question for a follow-up round.',
	rounds: 'Previous reviewed analysis rounds, supplied so the next round can build on them instead of repeating them.',
	sources: 'The source references already collected for the analysis.',
	graphSummary: 'A compact summary of the graph already produced for this analysis, when available.',
	followUpQuery: 'The new question the person asked after reviewing earlier results.',
	blocks: 'The approved report blocks supplied to the report-generation step.',
	section: 'The report section specification selected for this generation step.',
	insights: 'The reviewed user insights that the report action should place into suitable sections.',
	messages: 'The bounded conversation messages relevant to this chat action.',
	userMessage: 'The person’s latest chat message.',
	assistantReply: 'The assistant reply being analysed or summarised.',
	context: 'Context assembled by the owning action for this run.',
	stats: 'A structured Vault health snapshot supplied by the review action.',
};

export function describePromptInputs(template: string): readonly AIControlPromptInput[] {
	const fields = new Set<string>();
	const matcher = /{{\s*(?![#/^!>])([A-Za-z][A-Za-z0-9_.-]*)/g;
	for (const match of template.matchAll(matcher)) {
		const root = match[1]?.split('.')[0];
		if (root) fields.add(root);
	}
	return [...fields].map((name) => ({
		name,
		description: DESCRIPTIONS[name]
			?? `Peak supplies this value from the owning action when it runs. It is read-only context here; only use it when that action provides it.`,
	}));
}
