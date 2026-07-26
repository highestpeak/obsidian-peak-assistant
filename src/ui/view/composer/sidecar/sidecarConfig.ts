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
import type { IntelligenceMetricDimension } from '@/service/composer';

export interface SidecarStrings {
	title: string;
	followingDoc: string;
	tabCopilot: string;
	tabHistory: string;
	close: string;
	openDrawer: string;
	back: string;
	briefHeading: string;
	sectionNextMoves: string;
	sectionRelated: string;
	sectionUnplaced: string;
	whyRanked: string;
	refreshBrief: string;
	viewSource: string;
	bringIntoSession: string;
	openFullView: string;
	ignore: string;
	discuss: string;
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
	reviewClose: string;
	emptyBrief: string;
}

export interface SidecarConfig {
	narrowBreakpointPx: number;
	relatedPreviewCap: number;
	graphNodeCap: number;
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
	relatedPreviewCap: 6,
	graphNodeCap: 100,
	strings: {
		title: 'Intelligence',
		followingDoc: '正在跟随正文',
		tabCopilot: 'Copilot',
		tabHistory: 'History',
		close: '关闭',
		openDrawer: '打开智能侧栏',
		back: '返回',
		briefHeading: '针对当前正文，接下来值得处理什么',
		sectionNextMoves: '接下来可能要做',
		sectionRelated: '相关材料',
		sectionUnplaced: '还没安放的想法',
		whyRanked: '为什么这些排在前面？',
		refreshBrief: '更新建议',
		viewSource: '查看来源',
		bringIntoSession: '带入协作',
		openFullView: '打开完整视图',
		ignore: '忽略',
		discuss: '问 Copilot',
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
		reviewClose: '完成审阅',
		emptyBrief: '暂无新的建议',
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
			narrowBreakpointPx: s.narrowBreakpointPx ?? DEFAULT_SIDECAR_CONFIG.narrowBreakpointPx,
			relatedPreviewCap: s.relatedPreviewCap ?? DEFAULT_SIDECAR_CONFIG.relatedPreviewCap,
			graphNodeCap: s.graphNodeCap ?? DEFAULT_SIDECAR_CONFIG.graphNodeCap,
			strings: { ...DEFAULT_SIDECAR_CONFIG.strings, ...(s.strings ?? {}) },
		};
	} catch {
		return DEFAULT_SIDECAR_CONFIG;
	}
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
