/**
 * Peak Composer — Intelligence Sidecar config (WP9).
 *
 * Mirrors `templates/config/composer.json` → `sidecar` + `telemetry`. Per
 * docs/conventions/configurability.md the Sidecar's labels, the preview cap, the
 * narrow breakpoint and the whole §12.7 telemetry event catalog are DATA here,
 * never literals in TSX. Loads the runtime JSON and falls back to the compiled
 * default on any failure (same pattern as `composerConfig.ts`).
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import {
	DEFAULT_BRIEF_SENSING_POLICY,
	DEFAULT_UNCHECKED_TASK_PATTERN_SOURCE,
	type IntelligenceMetricDimension,
} from '@/service/composer';

export interface SidecarStrings {
	title: string;
	followingDoc: string;
	scopeLabel: string;
	scopeTrigger: string;
	scopeDocument: string;
	scopeWorkSegment: string;
	scopePinned: string;
	startNewWorkSegment: string;
	endWorkSegment: string;
	tabCopilot: string;
	tabHistory: string;
	close: string;
	openDrawer: string;
	back: string;
	briefHeading: string;
	briefIntro: string;
	currentFocus: string;
	currentDocument: string;
	updatedAtPrefix: string;
	askCopilot: string;
	refreshSuggestions: string;
	suggestionUpdate: string;
	manualSensing: string;
	idleSensing: string;
	continuousSensing: string;
	sensingMenuTitle: string;
	sensingManualHint: string;
	sensingIdleHint: string;
	sensingContinuousHint: string;
	sensingRecommended: string;
	autoPrepare: string;
	autoPrepareHint: string;
	autoPrepareDescription: string;
	autoPrepareUnavailable: string;
	sensingSafetyNote: string;
	manualChecking: string;
	sectionNextMoves: string;
	sectionRelated: string;
	sectionUnplaced: string;
	sortByImpactAndDocumentOrder: string;
	viewAllSuggestions: string;
	collapseSuggestions: string;
	moveLater: string;
	moveLaterHint: string;
	ignoreThisRound: string;
	ignoreThisRoundHint: string;
	relatedAsEvidence: string;
	viewAllThoughts: string;
	collapseThoughts: string;
	thoughtsNotTasks: string;
	organizeThought: string;
	thoughtFromRun: string;
	noUnplacedIdeas: string;
	sourceDetails: string;
	sectionNextMovesEmpty: string;
	sectionRelatedEmpty: string;
	sectionRelatedUnavailable: string;
	sectionRelatedLoading: string;
	sectionRelatedError: string;
	sectionUnplacedEmpty: string;
	openTaskReasonPrefix: string;
	openTaskSummary: string;
	openTaskTargetLabel: string;
	openTaskEvidenceLabel: string;
	openTaskUncheckedPattern: string;
	whyRanked: string;
	refreshRelated: string;
	viewSource: string;
	bringIntoSession: string;
	openFullView: string;
	ignore: string;
	discuss: string;
	commentSource: string;
	externalCommentWarning: string;
	askComposerPlaceholder: string;
	send: string;
	stop: string;
	allCapabilities: string;
	capabilityPickerHint: string;
	capabilityDialogTitle: string;
	capabilityDialogSubtitle: string;
	capabilitySearchPlaceholder: string;
	capabilityRecommendedGroup: string;
	capabilityOtherGroup: string;
	capabilityAvailable: string;
	capabilityOtherObject: string;
	capabilityNoResults: string;
	sessionStartTitle: string;
	sessionStartBody: string;
	currentContext: string;
	originAutomaticSuggestion: string;
	originAskCopilot: string;
	originCommentHandoff: string;
	originHistoryDeepLink: string;
	originNativeEditor: string;
	autoRoute: string;
	autoModel: string;
	noAvailableCapabilities: string;
	previewFixtureLabel: string;
	previewFixtureNote: string;
	materialPreview: string;
	materialReason: string;
	materialPreviewEmpty: string;
	materialListTitle: string;
	materialHoverHint: string;
	relatedModalSubtitle: string;
	relatedFilterPlaceholder: string;
	receiptChanges: string;
	receiptInsights: string;
	receiptSources: string;
	receiptTrace: string;
	locateInDocument: string;
	staleFindingNotice: string;
	generationHistoryTitle: string;
	generationHistoryIntro: string;
	generationHistoryEmpty: string;
	generationHistoryCount: string;
	generationHistoryVersions: string;
	generationHistoryAccepted: string;
	generationHistoryNotAdopted: string;
	generationHistoryPending: string;
	generationHistoryFailed: string;
	generationHistoryCancelled: string;
	generationHistoryStale: string;
	generationHistoryRestore: string;
	generationHistoryRestored: string;
	documentHistoryTitle: string;
	documentHistoryIntro: string;
	historyEmpty: string;
	historyTitle: string;
	historyIntro: string;
	historyTransactionCount: string;
	historyToday: string;
	historyNoTarget: string;
	historyDocumentTarget: string;
	historyBlockTarget: string;
	historyUnitTarget: string;
	historySelectionTarget: string;
	historyDirect: string;
	historyAiAccepted: string;
	historyRollback: string;
	historyBatchDirect: string;
	historyBatchCopilot: string;
	historyBatchMeta: string;
	historyRollbackAction: string;
	historyPreviewTitle: string;
	historyBefore: string;
	historyAfter: string;
	historyPreviewUnavailable: string;
	historyUnifiedTitle: string;
	historyUnifiedIntro: string;
	historyActivityCount: string;
	historyFilter: string;
	historyFilterAll: string;
	historyFilterSource: string;
	historyFilterAction: string;
	historyFilterStatus: string;
	historyFilterTarget: string;
	historyResetFilters: string;
	historySourceGeneration: string;
	historySourceCopilot: string;
	historySourceDocument: string;
	historyActionAnalyze: string;
	historyActionRewrite: string;
	historyActionInsert: string;
	historyActionDelete: string;
	historyActionTransform: string;
	historyActionMetadata: string;
	historyActionAsset: string;
	historyActionNative: string;
	historyStatusRunning: string;
	historyStatusCompleted: string;
	historyStatusRolledBack: string;
	historyLegacyGeneration: string;
	historyOpenDetail: string;
	historyDetailTitle: string;
	historyDetailSubtitle: string;
	historyInstruction: string;
	historyOriginal: string;
	historyGenerated: string;
	historyCurrentDocument: string;
	historyProcess: string;
	historySourceChanged: string;
	historyCurrentMissing: string;
	historyNoContent: string;
	historyVersion: string;
	historyPreviousVersion: string;
	historyNextVersion: string;
	historyViewAll: string;
	reviewClose: string;
	emptyBrief: string;
	emptyBriefBody: string;
}

export interface SidecarPreviewMaterial {
	id: string;
	title: string;
	path: string;
	content: string;
	reason: string;
	score: number;
}

export interface SidecarPreviewThought {
	id: string;
	label: string;
	detail: string;
}

export interface SidecarPreviewFixture {
	/** Exact Vault file names allowed to show explicitly-labelled design preview data. */
	fileNames: readonly string[];
	materials: readonly SidecarPreviewMaterial[];
	thoughts: readonly SidecarPreviewThought[];
}

export interface SidecarConfig {
	narrowBreakpointPx: number;
	briefPreviewCap: number;
	thoughtPreviewCap: number;
	relatedPreviewCap: number;
	relatedExcerptMaxChars: number;
	graphNodeCap: number;
	/** Quiet-period debounce for idle Brief sensing. */
	idleRefreshDelayMs: number;
	/** Minimum interval between continuous Brief sensing refreshes. */
	continuousRefreshMinIntervalMs: number;
	previewFixture: SidecarPreviewFixture;
	strings: SidecarStrings;
}

/** One telemetry event's declared name + field schema (from the config catalog). */
export interface TelemetryEventSpec {
	event: string;
	fields: Record<string, string>;
	kind?: 'ai' | 'deterministic';
}

export interface TelemetryCatalog {
	maxFieldStringLength: number;
	forbiddenFields: readonly string[];
	dimensions: Record<IntelligenceMetricDimension, readonly TelemetryEventSpec[]>;
	evaluationBoundary: Record<string, boolean>;
}

export const DEFAULT_SIDECAR_CONFIG: SidecarConfig = {
	narrowBreakpointPx: 1180,
	briefPreviewCap: 3,
	thoughtPreviewCap: 2,
	relatedPreviewCap: 6,
	relatedExcerptMaxChars: 240,
	graphNodeCap: 100,
	idleRefreshDelayMs: DEFAULT_BRIEF_SENSING_POLICY.idleRefreshDelayMs,
	continuousRefreshMinIntervalMs: DEFAULT_BRIEF_SENSING_POLICY.continuousRefreshMinIntervalMs,
	previewFixture: {
		fileNames: ['Peak Composer Visual Parity QA.md'],
		materials: [
			{
				id: 'preview-copilot-prd',
				title: 'Peak Assistant Copilot PRD',
				path: 'kb2-learn-prd/B-Z-mess/AI-peakAssistant-Copilot-prd-snapshot-for-ideastream-thought.md',
				content: '围绕当前正文给出可定位、可审阅、不会自动写入的 Copilot 建议。',
				reason: '同一 Copilot 产品方向，可作为交互和能力边界依据。',
				score: 0.94,
			},
			{
				id: 'preview-ai-workflow',
				title: 'AI Workflow',
				path: 'kb2-learn-prd/B-0-BestPractice/sections/AI-workflow.md',
				content: '把 AI 建议、人工判断、写回和历史记录拆成可检查的工作流。',
				reason: '补充当前任务的执行顺序与人工审阅边界。',
				score: 0.88,
			},
			{
				id: 'preview-knowledge-call',
				title: '知识调用：填充还是搜索',
				path: 'kb2-learn-prd/B-Z-mess/peakassistant-知识调用是否是填而不是搜索.md',
				content: '知识材料不仅用于搜索结果，也可以成为当前写作上下文的一部分。',
				reason: '直接关联“相关材料如何进入当前正文”的产品问题。',
				score: 0.82,
			},
		],
		thoughts: [
			{
				id: 'preview-thought-review',
				label: '把“建议”与“直接改写”明确分成两个动作',
				detail: '建议先进入审阅面板，只有接受后才写入正文。',
			},
			{
				id: 'preview-thought-source',
				label: '相关材料卡片需要同时说明来源和相关原因',
				detail: '用户不仅要看到标题，还要知道为什么这份材料会出现在这里。',
			},
		],
	},
	strings: {
		title: 'Intelligence',
		followingDoc: '正在跟随正文',
		scopeLabel: 'Intelligence 范围',
		scopeTrigger: '范围',
		scopeDocument: '当前文档',
		scopeWorkSegment: '当前工作段',
		scopePinned: '固定范围',
		startNewWorkSegment: '开始新工作段',
		endWorkSegment: '结束工作段',
		tabCopilot: 'Copilot',
		tabHistory: 'History',
		close: '关闭',
		openDrawer: '打开智能侧栏',
		back: '返回',
		briefHeading: '针对当前正文，接下来值得处理什么',
		briefIntro: '只显示能定位到当前正文或真实相关材料的建议；不会自动写入正文。',
		currentFocus: '正在关注',
		currentDocument: '当前正文',
		updatedAtPrefix: '更新于',
		askCopilot: '问 Copilot',
		refreshSuggestions: '更新建议',
		suggestionUpdate: '建议更新',
		manualSensing: '仅手动',
		idleSensing: '停笔后',
		continuousSensing: '编辑时',
		sensingMenuTitle: '什么时候检查新建议',
		sensingManualHint: '只在你点击“更新建议”时检查',
		sensingIdleHint: '切换文件或停止编辑后检查',
		sensingContinuousHint: '编辑期间定期检查；消耗更多 token',
		sensingRecommended: '推荐',
		autoPrepare: '自动准备待审改动',
		autoPrepareHint: '发现新建议后',
		autoPrepareDescription: '符合规则时可继续生成候选；仍需你审阅',
		autoPrepareUnavailable: '候选准备尚未接入当前运行时',
		sensingSafetyNote: '任何设置都不会自动接受或写入正文',
		manualChecking: '仅手动检查',
		sectionNextMoves: '接下来可能要做',
		sectionRelated: '相关材料',
		sectionUnplaced: '还没安放的想法',
		sortByImpactAndDocumentOrder: '按影响与正文顺序排序',
		viewAllSuggestions: '查看全部 {count} 条建议',
		collapseSuggestions: '收起',
		moveLater: '移到后面',
		moveLaterHint: '降低当前排序',
		ignoreThisRound: '本轮忽略',
		ignoreThisRoundHint: '刷新后可恢复',
		relatedAsEvidence: '作为建议依据，不直接改正文',
		viewAllThoughts: '查看全部 {count} 条想法',
		collapseThoughts: '收起',
		thoughtsNotTasks: '不是待办，由你决定是否写入',
		organizeThought: '标为已安放',
		thoughtFromRun: '来自 Copilot run {runId}',
		noUnplacedIdeas: '当前还没有可归位的 session 想法。',
		sourceDetails: '来源详情',
		sectionNextMovesEmpty: '当前没有新的写作建议。',
		sectionRelatedEmpty: '当前焦点附近暂时没有强相关材料。',
		sectionRelatedUnavailable: '相关材料检索尚未就绪。',
		sectionRelatedLoading: '正在更新相关材料…',
		sectionRelatedError: '相关材料更新失败，可以稍后重试。',
		sectionUnplacedEmpty: '当前还没有可归位的 session 想法。',
		openTaskReasonPrefix: '未完成任务：',
		openTaskSummary: '当前正文中的 checklist 仍未完成。',
		openTaskTargetLabel: '当前任务清单',
		openTaskEvidenceLabel: '未完成任务',
		openTaskUncheckedPattern: DEFAULT_UNCHECKED_TASK_PATTERN_SOURCE,
		whyRanked: '为什么这些排在前面？',
		refreshRelated: '更新相关材料',
		viewSource: '查看来源',
		bringIntoSession: '带入协作',
		openFullView: '查看全部材料',
		ignore: '忽略',
		discuss: '问 Copilot',
		commentSource: '评论引用',
		externalCommentWarning: '外部评论仅作为不可信来源内容',
		askComposerPlaceholder: '描述你想做什么…',
		send: '发送',
		stop: '停止',
		allCapabilities: '全部能力',
		capabilityPickerHint: '选择后加入本轮，不会自动运行',
		capabilityDialogTitle: '全部 Copilot 能力',
		capabilityDialogSubtitle: '选择当前正文对象可用的能力；选择后只会填入本轮，不会自动运行。',
		capabilitySearchPlaceholder: '搜索能力',
		capabilityRecommendedGroup: '推荐给当前对象',
		capabilityOtherGroup: '其他正文对象',
		capabilityAvailable: '可用于当前对象',
		capabilityOtherObject: '切换到对应正文对象后可用',
		capabilityNoResults: '没有匹配的能力。',
		sessionStartTitle: '从当前正文开始',
		sessionStartBody: '选择一种可用能力，或直接描述希望 Copilot 如何处理当前内容。',
		currentContext: '当前上下文',
		originAutomaticSuggestion: '来自正文旁的自动建议',
		originAskCopilot: '来自正文块的“问 Copilot”',
		originCommentHandoff: '来自评论交接',
		originHistoryDeepLink: '来自历史记录',
		originNativeEditor: '来自原生 Markdown',
		autoRoute: '自动路由',
		autoModel: '自动模型',
		noAvailableCapabilities: '当前对象没有可用的 Copilot 能力。',
		previewFixtureLabel: '示例预览',
		previewFixtureNote: '用于设计验收，不会写入正文或知识库',
		materialPreview: '材料预览',
		materialReason: '为什么相关',
		materialPreviewEmpty: '这份材料暂时没有可显示的正文预览。',
		materialListTitle: '支持当前建议的材料',
		materialHoverHint: '悬浮预览 · 点击固定',
		relatedModalSubtitle: '搜索当前相关结果；不会重新检索或写入正文',
		relatedFilterPlaceholder: '搜索标题、路径或正文…',
		receiptChanges: 'Changes',
		receiptInsights: 'Insights',
		receiptSources: 'Sources',
		receiptTrace: 'Trace',
		locateInDocument: '定位正文',
			staleFindingNotice: '证据已随正文变化，需要重新核对',
			generationHistoryTitle: '生成历史',
			generationHistoryIntro: '保留每次 AI 生成和所有版本；关闭或未采用不会删除。',
			generationHistoryEmpty: '还没有 AI 生成记录',
			generationHistoryCount: '{count} 次生成',
			generationHistoryVersions: '{count} 个版本',
			generationHistoryAccepted: '已采用',
			generationHistoryNotAdopted: '未采用',
			generationHistoryPending: '待审阅',
			generationHistoryFailed: '生成失败',
			generationHistoryCancelled: '已取消',
			generationHistoryStale: '源已变化',
			generationHistoryRestore: '恢复到正文',
			generationHistoryRestored: '已恢复，可在正文中继续审阅',
			documentHistoryTitle: '文档历史',
			documentHistoryIntro: '只记录真正写入正文的编辑、接受和回滚。',
			historyEmpty: '还没有已接受的写入',
			historyTitle: '文档历史',
			historyIntro: '记录你的直接编辑、AI 辅助后接受、AI 后调整与系统回滚；不记录建议和生成过程。',
			historyTransactionCount: '{count} 笔事务',
			historyToday: '今天',
			historyNoTarget: '当前正文',
			historyDocumentTarget: '全文',
			historyBlockTarget: '正文块',
			historyUnitTarget: '列表项',
			historySelectionTarget: '文本选区',
			historyDirect: '你直接编辑',
			historyAiAccepted: 'AI 辅助 · 你已接受',
			historyRollback: '系统回滚',
			historyBatchDirect: '连续直接编辑 · {count} 处',
			historyBatchCopilot: '本轮 Copilot 写入 · {count} 处',
			historyBatchMeta: '{count} 笔独立事务',
			historyRollbackAction: '回滚',
			historyPreviewTitle: '修改预览',
			historyBefore: '修改前',
			historyAfter: '修改后',
			historyPreviewUnavailable: '这笔事务没有可显示的文字差异。',
			historyUnifiedTitle: '活动历史',
			historyUnifiedIntro: '生成、Copilot 与真正写入正文的编辑都在这里，未采用内容也会保留。',
			historyActivityCount: '{count} 条活动',
			historyFilter: '筛选历史',
			historyFilterAll: '全部',
			historyFilterSource: '来源',
			historyFilterAction: '操作',
			historyFilterStatus: '状态',
			historyFilterTarget: '对象',
			historyResetFilters: '清除筛选',
			historySourceGeneration: 'AI 生成',
			historySourceCopilot: 'Copilot',
			historySourceDocument: '文档编辑',
			historyActionAnalyze: '分析',
			historyActionRewrite: '改写',
			historyActionInsert: '新增',
			historyActionDelete: '删除',
			historyActionTransform: '结构调整',
			historyActionMetadata: '属性修改',
			historyActionAsset: '资源修改',
			historyActionNative: '原生对象',
			historyStatusRunning: '生成中',
			historyStatusCompleted: '已完成',
			historyStatusRolledBack: '已回滚',
			historyLegacyGeneration: '旧 AI 生成',
			historyOpenDetail: '查看详情',
			historyDetailTitle: '历史详情',
			historyDetailSubtitle: '查看生成时的原文、结果和当前正文。',
			historyInstruction: '当时的指令',
			historyOriginal: '当时原文',
			historyGenerated: '生成结果',
			historyCurrentDocument: '当前正文',
			historyProcess: '过程记录',
			historySourceChanged: '正文在这次活动之后已经变化，恢复时会继续执行安全检查。',
			historyCurrentMissing: '当前正文中已经找不到原来的目标位置。',
			historyNoContent: '这条旧记录没有可恢复的正文详情。',
			historyVersion: '版本 {current}/{total}',
			historyPreviousVersion: '上一个版本',
			historyNextVersion: '下一个版本',
			historyViewAll: '查看该段全部历史',
			reviewClose: '完成审阅',
		emptyBrief: '暂无新项目',
		emptyBriefBody: '当前没有来自已接入数据源的新项目。你可以继续写作，或主动问 Copilot。',
	},
};

interface ComposerJsonShape {
	sidecar?: Partial<SidecarConfig> & { strings?: Partial<SidecarStrings> };
	telemetry?: Partial<TelemetryCatalog>;
}

/** Load the Sidecar config, preferring runtime JSON, falling back to the default. */
export async function loadSidecarConfig(): Promise<SidecarConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_SIDECAR_CONFIG;
		const parsed = await tm.loadJson<ComposerJsonShape>(ConfigTemplateId.Composer);
		const s = parsed?.sidecar;
		if (!s || typeof s !== 'object') return DEFAULT_SIDECAR_CONFIG;
		return {
			narrowBreakpointPx: positiveInteger(s.narrowBreakpointPx, DEFAULT_SIDECAR_CONFIG.narrowBreakpointPx),
			briefPreviewCap: positiveInteger(s.briefPreviewCap, DEFAULT_SIDECAR_CONFIG.briefPreviewCap),
			thoughtPreviewCap: positiveInteger(s.thoughtPreviewCap, DEFAULT_SIDECAR_CONFIG.thoughtPreviewCap),
			relatedPreviewCap: positiveInteger(s.relatedPreviewCap, DEFAULT_SIDECAR_CONFIG.relatedPreviewCap),
			relatedExcerptMaxChars: positiveInteger(
				s.relatedExcerptMaxChars,
				DEFAULT_SIDECAR_CONFIG.relatedExcerptMaxChars,
			),
			graphNodeCap: positiveInteger(s.graphNodeCap, DEFAULT_SIDECAR_CONFIG.graphNodeCap),
			idleRefreshDelayMs: positiveInteger(s.idleRefreshDelayMs, DEFAULT_SIDECAR_CONFIG.idleRefreshDelayMs),
			continuousRefreshMinIntervalMs: positiveInteger(
				s.continuousRefreshMinIntervalMs,
				DEFAULT_SIDECAR_CONFIG.continuousRefreshMinIntervalMs,
			),
			previewFixture: mergePreviewFixture(s.previewFixture),
			strings: { ...DEFAULT_SIDECAR_CONFIG.strings, ...(s.strings ?? {}) },
		};
	} catch {
		return DEFAULT_SIDECAR_CONFIG;
	}
}

function mergePreviewFixture(value: unknown): SidecarPreviewFixture {
	if (!value || typeof value !== 'object') return DEFAULT_SIDECAR_CONFIG.previewFixture;
	const input = value as Partial<SidecarPreviewFixture>;
	return {
		fileNames: Array.isArray(input.fileNames) ? input.fileNames : DEFAULT_SIDECAR_CONFIG.previewFixture.fileNames,
		materials: Array.isArray(input.materials) ? input.materials : DEFAULT_SIDECAR_CONFIG.previewFixture.materials,
		thoughts: Array.isArray(input.thoughts) ? input.thoughts : DEFAULT_SIDECAR_CONFIG.previewFixture.thoughts,
	};
}

function positiveInteger(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	const normalized = Math.floor(value);
	return normalized > 0 ? normalized : fallback;
}

/** Load the §12.7 telemetry event catalog (data-driven instrumentation semantics). */
export async function loadTelemetryCatalog(): Promise<TelemetryCatalog | null> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return null;
		const parsed = await tm.loadJson<ComposerJsonShape>(ConfigTemplateId.Composer);
		const t = parsed?.telemetry;
		if (!t || typeof t !== 'object' || !t.dimensions) return null;
		return {
			maxFieldStringLength: t.maxFieldStringLength ?? 120,
			forbiddenFields: t.forbiddenFields ?? [],
			dimensions: t.dimensions as TelemetryCatalog['dimensions'],
			evaluationBoundary: t.evaluationBoundary ?? {},
		};
	} catch {
		return null;
	}
}
