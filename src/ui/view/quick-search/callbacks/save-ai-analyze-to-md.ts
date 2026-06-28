import { SLICE_CAPS } from '@/core/constant';
import { App, TFile } from 'obsidian';
import { ensureFolderRecursive as ensureFolder } from '@/core/storage/vault/vault-ops';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { GraphNodeType } from '@/core/po/graph.po';
import type { AISearchGraph, AISearchSource } from '@/core/types/agents-shared';
import type { DashboardBlock } from '@/core/types/agents-shared';
import type { SearchResultItem } from '@/core/search/searchTypes';
import { buildMarkdown as buildAiSearchAnalysisMarkdown, fromCompletedAnalysisSnapshot, type BuildMarkdownOptions } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
import type { CompletedAnalysisSnapshot } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { buildAiGraphMarkdown } from '@/core/storage/vault/search-docs/AiGraphDoc';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';

/**
 * T11M: explicit deps so this module no longer reaches for
 * `AppContext.getInstance()`. UI callers obtain `{ app, enableDevTools }`
 * via `useQuickSearchHost()` and pass them in — `useQuickSearchHost`
 * already exposes bound versions (`host.saveAnalysisToVault`,
 * `host.persistAnalysisDoc`, `host.saveGraphToVault`,
 * `host.buildAnalysisMarkdownFromSnapshot`).
 */
export type SaveDeps = { app: App; enableDevTools: boolean };
export type AppDeps = { app: App };

/** Source shape for export/save; compatible with AISearchSource (path, title, score.average, reasoning). */
export type ExportSource = { path: string; title: string; score?: number; content?: string };

/** Per-topic Analyze Q&A for export. */
export type ExportTopicAnalyzeResult = { question: string; answer: string };

export type SaveAnalysisResultParams = {
	folderPath: string;
	fileName: string;
	query: string;
	/** Full snapshot; when provided, uses AiSearchAnalysisDoc format. */
	snapshot?: CompletedAnalysisSnapshot;
	result?: {
		title?: string;
		summary: string;
		sources: ExportSource[];
		insights?: {
			topics?: Array<{ label: string; weight: number }>;
			graph?: AISearchGraph;
		};
		topicInspectResults?: Record<string, SearchResultItem[]>;
		topicAnalyzeResults?: Record<string, ExportTopicAnalyzeResult[]>;
		topicGraphResults?: Record<string, GraphPreview | null>;
		usage?: { estimatedTokens?: number };
	};
	webEnabled?: boolean;
};

/**
 * Save AI analysis result to a markdown file in the vault.
 * Uses AiSearchAnalysisDoc when snapshot is provided; otherwise builds from result.
 * Accepts explicit deps (app, enableDevTools) so Quick Search callers don't need AppContext.getInstance().
 * Falls back to AppContext singleton when deps not provided (for legacy callers outside Quick Search scope).
 */
export async function saveAiAnalyzeResultToMarkdown(params: SaveAnalysisResultParams, deps: SaveDeps): Promise<{ path: string }> {
	const { app, enableDevTools } = deps;
	const folder = params.folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
	const fileName = sanitizeFileName(params.fileName || 'AI Search Results');
	const fullFolderPath = folder.length ? folder : '';
	const filePath = fullFolderPath ? `${fullFolderPath}/${fileName}.md` : `${fileName}.md`;

	if (fullFolderPath) {
		await ensureFolder(fullFolderPath, app);
	}

	const buildOptions: BuildMarkdownOptions = {
		runAnalysisMode: params.snapshot?.runAnalysisMode,
		includeSteps: enableDevTools === true,
	};

	let content: string;
	if (params.snapshot) {
		const docModel = fromCompletedAnalysisSnapshot(params.snapshot, params.query, params.webEnabled === true);
		docModel.created = new Date().toISOString();
		content = buildAiSearchAnalysisMarkdown(docModel, buildOptions);
	} else {
		const r = params.result!;
		const snapshot: CompletedAnalysisSnapshot = {
			version: 1,
			title: r.title,
			summaries: r.summary ? [r.summary] : [],
			summaryVersion: 1,
			analysisStartedAtMs: null,
			duration: null,
			usage: r.usage?.estimatedTokens != null ? { inputTokens: 0, outputTokens: r.usage.estimatedTokens, totalTokens: r.usage.estimatedTokens } : null,
			topics: r.insights?.topics ?? [],
			dashboardBlocks: [],
			sources: r.sources.map((s, i) => ({
				id: s.path ? `replay:${s.path}` : `replay:src:${i}`,
				path: s.path,
				title: s.title,
				reasoning: s.content ?? '',
				badges: [],
				score: { physical: s.score ?? 0, semantic: s.score ?? 0, average: s.score ?? 0 },
			})),
			graph: r.insights?.graph ?? null,
			topicInspectResults: r.topicInspectResults ?? {},
			topicAnalyzeResults: r.topicAnalyzeResults ?? {},
			topicGraphResults: r.topicGraphResults ?? {},
		};
		const docModel = fromCompletedAnalysisSnapshot(snapshot, params.query, params.webEnabled === true);
		docModel.created = new Date().toISOString();
		content = buildAiSearchAnalysisMarkdown(docModel, buildOptions);
	}

	const existing = app.vault.getAbstractFileByPath(filePath);
	let finalPath = filePath;
	if (existing) {
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		finalPath = fullFolderPath ? `${fullFolderPath}/${fileName}-${ts}.md` : `${fileName}-${ts}.md`;
	}
	await app.vault.create(finalPath, content);
	return { path: finalPath };
}

/**
 * Overwrite an existing AI analysis document at path with new content.
 * Use after follow-up content or usage changes to keep the saved file in sync.
 */
export async function persistAnalysisDocToPath(path: string, content: string, deps: AppDeps): Promise<void> {
	const { app } = deps;
	const file = app.vault.getAbstractFileByPath(path);
	if (file && file instanceof TFile) {
		await app.vault.modify(file, content);
	}
}

export async function saveAiGraphToMarkdown(params: {
	folderPath: string;
	fileName: string;
	query: string;
	summary: string;
	graphData: LensGraphData;
	lensHint?: string;
}, deps: AppDeps): Promise<{ path: string }> {
	const { app } = deps;
	const folder = params.folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
	const fileName = sanitizeFileName(params.fileName || 'AI Graph');
	const fullFolderPath = folder.length ? folder : '';
	const filePath = fullFolderPath ? `${fullFolderPath}/${fileName}.md` : `${fileName}.md`;

	if (fullFolderPath) {
		await ensureFolder(fullFolderPath, app);
	}

	const content = buildAiGraphMarkdown({
		query: params.query,
		created: new Date().toISOString(),
		summary: params.summary,
		graphData: params.graphData,
		lensHint: params.lensHint,
	});

	const existing = app.vault.getAbstractFileByPath(filePath);
	let finalPath = filePath;
	if (existing) {
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		finalPath = fullFolderPath ? `${fullFolderPath}/${fileName}-${ts}.md` : `${fileName}-${ts}.md`;
	}
	await app.vault.create(finalPath, content);
	return { path: finalPath };
}

function sanitizeFileName(name: string): string {
	return name
		.trim()
		.replace(/[\\\\/:*?\"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.slice(0, SLICE_CAPS.ui.saveAnalyzeMd);
}

/**
 * Build markdown from snapshot (for copy, etc). Uses AiSearchAnalysisDoc format.
 * Accepts explicit deps so callers don't need AppContext.getInstance().
 */
export function buildAiAnalyzeMarkdownFromSnapshot(
	snapshot: CompletedAnalysisSnapshot,
	query: string,
	webEnabled: boolean,
	deps: { enableDevTools: boolean }
): string {
	const docModel = fromCompletedAnalysisSnapshot(snapshot, query, webEnabled);
	docModel.created = new Date().toISOString();
	const options: BuildMarkdownOptions = {
		runAnalysisMode: snapshot.runAnalysisMode,
		includeSteps: deps.enableDevTools === true,
	};
	return buildAiSearchAnalysisMarkdown(docModel, options);
}

/** Params for buildAiAnalyzeMarkdown (exported for use in hooks). */
export type BuildAiAnalyzeMarkdownParams = {
	query: string;
	webEnabled: boolean;
	summary: string;
	topics?: Array<{ label: string; weight: number }>;
	sources: ExportSource[];
	topicInspectResults?: Record<string, SearchResultItem[]>;
	topicAnalyzeResults?: Record<string, ExportTopicAnalyzeResult[]>;
	topicGraphResults?: Record<string, GraphPreview | null>;
	estimatedTokens?: number;
};

/**
 * Build a Markdown document for saving AI analysis results (legacy params; delegates to AiSearchAnalysisDoc).
 */
export function buildAiAnalyzeMarkdown(params: BuildAiAnalyzeMarkdownParams, originalGraph?: AISearchGraph): string {
	const snapshot: CompletedAnalysisSnapshot = {
		version: 1,
		summaries: params.summary ? [params.summary] : [],
		summaryVersion: 1,
		analysisStartedAtMs: null,
		duration: null,
		usage: params.estimatedTokens != null ? { inputTokens: 0, outputTokens: params.estimatedTokens, totalTokens: params.estimatedTokens } : null,
		topics: params.topics ?? [],
		dashboardBlocks: [],
		sources: params.sources.map((s, i) => ({
			id: s.path ? `replay:${s.path}` : `replay:src:${i}`,
			path: s.path,
			title: s.title,
			reasoning: s.content ?? '',
			badges: [],
			score: { physical: s.score ?? 0, semantic: s.score ?? 0, average: s.score ?? 0 },
		})),
		graph: originalGraph ?? null,
		topicInspectResults: params.topicInspectResults ?? {},
		topicAnalyzeResults: params.topicAnalyzeResults ?? {},
		topicGraphResults: params.topicGraphResults ?? {},
	};
	return buildAiAnalyzeMarkdownFromSnapshot(snapshot, params.query, params.webEnabled);
}
