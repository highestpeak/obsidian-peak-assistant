import assert from 'assert';
import { readFileSync } from 'fs';
import { deriveAnalysisActivityMetrics } from '@/service/search/activityMetrics';
import { isReportReadyForFollowup } from '@/ui/view/quick-search/components/reportState';

const metrics = deriveAnalysisActivityMetrics(
	[
		{
			id: 'folders',
			toolName: 'mcp__vault__vault_list_folders',
			displayName: 'List folders',
			icon: 'folder',
			input: {},
			status: 'done',
			startedAt: 1_000,
			endedAt: 1_800,
			summary: '12 folders · 340 files',
		},
		{
			id: 'read-a',
			toolName: 'mcp__vault__vault_read_note',
			displayName: 'Read note',
			icon: 'file',
			input: { path: 'Projects/Alpha.md' },
			status: 'done',
			startedAt: 1_900,
			endedAt: 2_500,
			summary: '4,200 chars',
		},
		{
			id: 'read-b',
			toolName: 'mcp__vault__vault_read_note',
			displayName: 'Read note',
			icon: 'file',
			input: { path: 'Projects/Beta.md' },
			status: 'done',
			startedAt: 2_600,
			endedAt: 3_400,
			summary: '900 chars',
		},
	],
	[
		{
			id: 'section',
			title: 'Evidence',
			contentType: 'analysis',
			visualType: 'table',
			evidencePaths: ['Projects/Alpha.md', 'Projects/Beta.md'],
			brief: '',
			weight: 1,
			missionRole: 'evidence_audit',
			status: 'done',
			content: 'Done',
			streamingText: '',
			generations: [],
		},
	],
	[],
	null,
);

assert.deepEqual(metrics, {
	durationMs: 2_400,
	foldersScanned: 12,
	filesConsidered: 340,
	filesRead: 2,
	charactersRead: 5_100,
	sourcesCited: 2,
});

const pendingSection = {
	id: 'pending',
	title: 'Pending',
	contentType: 'analysis',
	visualType: 'none',
	evidencePaths: [],
	brief: '',
	weight: 1,
	missionRole: 'synthesis',
	status: 'pending' as const,
	content: '',
	streamingText: '',
	generations: [],
};
assert.equal(
	isReportReadyForFollowup([pendingSection], '', false),
	false,
	'pending report sections must not expose the overall follow-up composer',
);
assert.equal(
	isReportReadyForFollowup(
		[{ ...pendingSection, status: 'done', content: 'Finished report section' }],
		'Summary',
		false,
	),
	true,
	'a completed report may expose the overall follow-up composer',
);
assert.equal(
	isReportReadyForFollowup([], 'Direct report', false),
	true,
	'a completed direct report may expose the overall follow-up composer',
);

const sourceView = readFileSync(
	'src/ui/view/quick-search/components/V2SourcesView.tsx',
	'utf8',
);
assert(sourceView.includes('ResultBrowserViewToggle'));
assert(sourceView.includes('ResultBrowserListRow'));
assert(sourceView.includes('ResultBrowserTree'));
assert(sourceView.includes('ResultBrowserGraph'));
assert(sourceView.includes('MultiLensGraph'));
assert(sourceView.includes('InspectorSidePanel'));
assert(!sourceView.includes('useOwnerDocumentListener'));
assert(sourceView.includes('data-v2-sources-projection'));
assert(sourceView.includes('<aside'));
assert(!sourceView.includes('Shared Result Browser ·'));
assert(!sourceView.includes('Sources · {sources.length} cited files'));
assert(sourceView.indexOf('<ResultBrowserViewToggle') < sourceView.indexOf('<GraphKindToggle'));
assert(sourceView.includes('isSourcesDensityVisible(view)'));
assert(sourceView.includes('resolveSourcesKeyboardIntent'));
assert(sourceView.includes('focusSourcesProjection'));
assert(!sourceView.includes("target.closest('[data-v2-sources-projection]')"));
assert(sourceView.includes("useOwnerWindowListener(rootRef, 'keydown', handleProjectionKey, true)"));
assert(sourceView.includes("target?.closest?.('[data-result-browser-row]')"));
assert(sourceView.includes('onInspect={(item) => openInspectorForPath(item.path)}'));

const resultListRow = readFileSync(
	'src/ui/component/result-browser/list/ResultBrowserListRow.tsx',
	'utf8',
);
assert(resultListRow.includes("e.key === 'ArrowRight'"));
assert(resultListRow.includes('onInspect?.(result)'));
assert(resultListRow.includes('if (e.defaultPrevented) return'));

const aiMapBody = sourceView.match(
	/const AIRelationshipMap[\s\S]*?export const V2SourcesView/,
)?.[0] ?? '';
assert(aiMapBody.includes('Relationship inputs'));
assert(!aiMapBody.includes('ResultBrowserGraphControls'));
assert(!aiMapBody.includes('ScopeToggle'));

const reportView = readFileSync(
	'src/ui/view/quick-search/components/V2ReportView.tsx',
	'utf8',
);
assert(reportView.includes('V2ReportContinueComposer'));
assert(reportView.includes('Ask'));
assert(reportView.includes('Revise'));
assert(reportView.includes('Copy'));
assert(!reportView.includes('{!isGenerating && <V2ReportContinueComposer />}'));
assert(!reportView.includes('ReportDebugTraceButton'));

const reportFooter = readFileSync(
	'src/ui/view/quick-search/components/V2Footer.tsx',
	'utf8',
);
assert(reportFooter.includes('buildReportTextFromParts(state.rounds'));
assert(reportFooter.includes('formatProcessSteps(round.steps)'));
assert(reportFooter.includes('Ask follow-up'));
assert(reportFooter.includes("v2View !== 'report'"));

const resultWorkspace = readFileSync(
	'src/ui/view/quick-search/components/V2SearchResultView.tsx',
	'utf8',
);
assert(!resultWorkspace.includes("setV2View('process')"));

const aiSearchTab = readFileSync(
	'src/ui/view/quick-search/tab-AISearch.tsx',
	'utf8',
);
assert(!aiSearchTab.includes('extra top/side padding for IntelligenceFrame glow'));
assert(!aiSearchTab.includes('pktw-pt-6'));

const resultToolbar = readFileSync(
	'src/ui/component/result-browser/toolbar/ResultBrowserToolbar.tsx',
	'utf8',
);
assert(!resultToolbar.includes('<button'));
assert(resultToolbar.includes('pk-result-browser-toolbar__option'));
assert(!resultToolbar.includes('!pktw-h-8'));

const sessionHook = readFileSync(
	'src/ui/view/quick-search/hooks/useSearchSession.ts',
	'utf8',
);
assert(sessionHook.includes('User report directions:'));
assert(sessionHook.includes('state.v2UserInsights'));

const sessionStore = readFileSync(
	'src/ui/view/quick-search/store/searchSessionStore.ts',
	'utf8',
);
assert(sessionStore.includes('const frozenIds = new Set('));
assert(sessionStore.includes('v2UserInsights: []'));

const graphHook = readFileSync(
	'src/ui/view/quick-search/hooks/useGraphAgent.ts',
	'utf8',
);
assert(graphHook.includes('`${searchQuery.trim()}\\n${sources.map'));

const landing = readFileSync('src/ui/view/quick-search/SearchModal.tsx', 'utf8');
assert(landing.includes('RecentAnalysisList'));
assert(landing.includes('RecentQueriesDropdown'));
assert(landing.includes('loadCompletedAnalysisSnapshot'));
assert(landing.includes('resolveAnalysisSnapshotFromVault'));
assert(
	landing.indexOf('<ActiveSessionsList') < landing.indexOf('<RecentQueriesDropdown'),
	'unfinished analyses must stay above recent-query shortcuts',
);
assert(
	landing.indexOf('<RecentQueriesDropdown') < landing.indexOf('<RecentAnalysisList'),
	'recent-query shortcuts must stay above completed analysis history',
);

console.log('AI Search report workspace contract tests passed');
