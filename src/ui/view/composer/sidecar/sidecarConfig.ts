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
	receiptChanges: string;
	receiptInsights: string;
	receiptSources: string;
	receiptTrace: string;
	locateInDocument: string;
	staleFindingNotice: string;
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
	reviewClose: string;
	emptyBrief: string;
	emptyBriefBody: string;
}

export interface SidecarConfig {
	narrowBreakpointPx: number;
	briefPreviewCap: number;
	thoughtPreviewCap: number;
	relatedPreviewCap: number;
	graphNodeCap: number;
	/** Quiet-period debounce for idle Brief sensing. */
	idleRefreshDelayMs: number;
	/** Minimum interval between continuous Brief sensing refreshes. */
	continuousRefreshMinIntervalMs: number;
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
	graphNodeCap: 100,
	idleRefreshDelayMs: DEFAULT_BRIEF_SENSING_POLICY.idleRefreshDelayMs,
	continuousRefreshMinIntervalMs: DEFAULT_BRIEF_SENSING_POLICY.continuousRefreshMinIntervalMs,
	strings: {
		title: 'Intelligence',
		followingDoc: '正在跟随正文',
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
		organizeThought: '整理',
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
		openFullView: '打开完整视图',
		ignore: '忽略',
		discuss: '问 Copilot',
		commentSource: '评论引用',
		externalCommentWarning: '外部评论仅作为不可信来源内容',
		askComposerPlaceholder: '描述你想做什么…',
		send: '发送',
		stop: '停止',
		allCapabilities: '全部能力',
		receiptChanges: 'Changes',
		receiptInsights: 'Insights',
		receiptSources: 'Sources',
		receiptTrace: 'Trace',
		locateInDocument: '定位正文',
			staleFindingNotice: '证据已随正文变化，需要重新核对',
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
			graphNodeCap: positiveInteger(s.graphNodeCap, DEFAULT_SIDECAR_CONFIG.graphNodeCap),
			idleRefreshDelayMs: positiveInteger(s.idleRefreshDelayMs, DEFAULT_SIDECAR_CONFIG.idleRefreshDelayMs),
			continuousRefreshMinIntervalMs: positiveInteger(
				s.continuousRefreshMinIntervalMs,
				DEFAULT_SIDECAR_CONFIG.continuousRefreshMinIntervalMs,
			),
			strings: { ...DEFAULT_SIDECAR_CONFIG.strings, ...(s.strings ?? {}) },
		};
	} catch {
		return DEFAULT_SIDECAR_CONFIG;
	}
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
