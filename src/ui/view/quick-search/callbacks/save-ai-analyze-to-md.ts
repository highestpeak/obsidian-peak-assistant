import { SLICE_CAPS } from '@/core/constant';
import { TFile } from 'obsidian';
import { ensureFolder } from '@/core/utils/vault-utils';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { GraphNodeType } from '@/core/po/graph.po';
import { AppContext } from '@/app/context/AppContext';
import type { AISearchGraph, AISearchSource } from '@/service/agents/shared-types';
import type { DashboardBlock } from '@/service/agents/shared-types';
import type { SearchResultItem } from '@/service/search/types';
import { buildMarkdown as buildAiSearchAnalysisMarkdown, fromCompletedAnalysisSnapshot, type BuildMarkdownOptions } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
import type { CompletedAnalysisSnapshot } from '@/ui/view/quick-search/store/aiAnalysisStore';

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
 */
export async function saveAiAnalyzeResultToMarkdown(params: SaveAnalysisResultParams): Promise<{ path: string }> {
	const ctx = AppContext.getInstance();
	const app = ctx.app;
	const folder = params.folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
	const fileName = sanitizeFileName(params.fileName || 'AI Search Results');
	const fullFolderPath = folder.length ? folder : '';
	const filePath = fullFolderPath ? `${fullFolderPath}/${fileName}.md` : `${fileName}.md`;

	if (fullFolderPath) {
		await ensureFolder(app, fullFolderPath);
	}

	const buildOptions: BuildMarkdownOptions = {
		runAnalysisMode: params.snapshot?.runAnalysisMode,
		includeSteps: ctx.settings?.enableDevTools === true,
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
export async function persistAnalysisDocToPath(path: string, content: string): Promise<void> {
	const app = AppContext.getInstance().app;
	const file = app.vault.getAbstractFileByPath(path);
	if (file && file instanceof TFile) {
		await app.vault.modify(file, content);
	}
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
 * Uses runAnalysisMode from snapshot and enableDevTools from app settings for section filtering.
 */
export function buildAiAnalyzeMarkdownFromSnapshot(
	snapshot: CompletedAnalysisSnapshot,
	query: string,
	webEnabled: boolean
): string {
	const docModel = fromCompletedAnalysisSnapshot(snapshot, query, webEnabled);
	docModel.created = new Date().toISOString();
	const options: BuildMarkdownOptions = {
		runAnalysisMode: snapshot.runAnalysisMode,
		includeSteps: AppContext.getInstance().settings?.enableDevTools === true,
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
