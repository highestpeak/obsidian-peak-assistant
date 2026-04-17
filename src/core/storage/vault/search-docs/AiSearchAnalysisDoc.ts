/**
 * AiSearchAnalysisDoc - AI Search Analysis Markdown Document Model
 * ================================================================
 *
 * Handles serialization and deserialization of AI search analysis results
 * to/from Markdown. Uses frontmatter for metadata and fixed section order for body.
 *
 * FILE STRUCTURE:
 * - Frontmatter: type, version, created, query, webEnabled, duration, estimatedTokens, analysisStartedAt
 * - Body sections (fixed order): Summary, Query, Key Topics, Sources, Topic Inspect Results,
 *   Topic Expansions, Dashboard Blocks, ...
 *
 * Tests: npm run test -- test/search-docs/AiSearchAnalysisDoc.test.ts
 */

import { SLICE_CAPS } from '@/core/constant';
import { extractSection } from '@/core/storage/vault/framework/MarkdownDocEngine';
import type { AISearchGraph, AISearchSource, AISearchTopic, DashboardBlock, EvidenceIndex } from '@/service/agents/shared-types';
import { getMermaidInner } from '@/core/utils/mermaid-utils';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { SearchResultItem } from '@/service/search/types';
import type { LLMUsage } from '@/core/providers/types';
import type { AnalysisMode, UIStepRecord, CompletedAnalysisSnapshot, SectionAnalyzeResult } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { getSnapshotSummary } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { GraphNodeType } from '@/core/po/graph.po';

const SECTION_SUMMARY = '# Summary';
const SECTION_QUERY = '# Query';
const SECTION_OVERVIEW = '# Overview';
const SECTION_OVERVIEW_HISTORY = '# Overview History';
const SECTION_SLOT_MERMAID = '# Slot coverage';
const SECTION_KEY_TOPICS = '# Key Topics';
const SECTION_SOURCES = '# Sources';
const SECTION_EVIDENCE = '# Evidence';
const SECTION_TOPIC_INSPECT = '# Topic Inspect Results';
const SECTION_TOPIC_EXPANSIONS = '# Topic Expansions';
const SECTION_DASHBOARD = '# Dashboard Blocks';
const SECTION_BLOCK_CHAT_RECORDS = '# Block Chat Records';
const SECTION_CONTINUE_ANALYSIS = '# Continue Analysis';
const SECTION_GRAPH_FOLLOWUPS = '# Graph Follow-ups';
const SECTION_BLOCKS_FOLLOWUPS = '# Blocks Follow-ups';
const SECTION_BLOCKS_FOLLOWUPS_BY_BLOCK = '# Blocks Follow-ups By Block';
const SECTION_SOURCES_FOLLOWUPS = '# Sources Follow-ups';
const SECTION_STEPS = '# Steps';

const REGEX_FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const REGEX_YAML_KEY = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, 'm');
const REGEX_CRLF = /\r\n/g;

/** Options for buildMarkdown: control which sections are written by mode and debug. */
export interface BuildMarkdownOptions {
	/** When set, full-only sections (Overview, Topics, Graph, Dashboard, etc.) are written only for vaultFull. */
	runAnalysisMode?: AnalysisMode;
	/** When true, Steps section is written; when false or omitted, Steps are omitted (e.g. when dev tools off). */
	includeSteps?: boolean;
}

function isFullAnalysisMode(mode?: AnalysisMode): boolean {
	return mode === 'vaultFull';
}

/** Single chat message for snapshot (graph/source/block context chats). */
export type SnapshotChatMessage = { role: string; content: string };

/** Document model for AI search analysis. Matches CompletedAnalysisSnapshot plus query/webEnabled. */
export interface AiSearchAnalysisDocModel {
	version: 1;
	/** Summary content version; every snapshot has one (e.g. 1). */
	summaryVersion?: number;
	created?: string;
	analysisStartedAtMs: number | null;
	duration: number | null;
	usage: LLMUsage | null;
	/** Short display title (from AI at end of analysis). */
	title?: string;
	/** Selected summary for md body (summaries[summaryVersion - 1]). */
	summary: string;
	/** All generated summaries. */
	summaries?: string[];
	query: string;
	webEnabled: boolean;
	runAnalysisMode?: AnalysisMode;
	topics: AISearchTopic[];
	dashboardBlocks: DashboardBlock[];
	/** Per-dashboard-block chat history (key = block id). Same pattern as dashboardBlocks + records by id. */
	blockChatRecords?: Record<string, SnapshotChatMessage[]>;
	sources: AISearchSource[];
	graph: AISearchGraph | null;
	topicInspectResults: Record<string, SearchResultItem[]>;
	topicAnalyzeResults: Record<string, SectionAnalyzeResult[]>;
	topicGraphResults: Record<string, GraphPreview | null>;
	/** Continue Analysis Q&A (user question → answer). */
	fullAnalysisFollowUp?: Array<{ title: string; content: string }>;
	/** Graph section follow-up history. */
	graphFollowups?: SectionAnalyzeResult[];
	/** Blocks section follow-up history (legacy flat list). */
	blocksFollowups?: SectionAnalyzeResult[];
	/** Per-block follow-up history (key = block id). */
	blocksFollowupsByBlockId?: Record<string, SectionAnalyzeResult[]>;
	/** Sources section follow-up history. */
	sourcesFollowups?: SectionAnalyzeResult[];
	/** All completed UI steps for replay. */
	steps?: UIStepRecord[];
	/** Evidence by path for Sources Evidence view (claim/quote per file). Replay-only when loading from doc. */
	evidenceIndex?: EvidenceIndex;
	/** Overview diagram (raw Mermaid code). */
	overviewMermaidActiveIndex?: number;
	// all versions of overview mermaid
	overviewMermaidVersions?: string[];
	/** Slot coverage diagram (raw Mermaid code). Latest only. */
	mindflowMermaid?: string;

	// V2 fields (SDK pipeline)
	v2ProcessLog?: string[];
	v2PlanOutline?: string;
	v2ReportSections?: Array<{ title: string; content: string }>;
	v2GraphJson?: string;
	v2FollowUpQuestions?: string[];
}

const EMPTY_DOC_MODEL: AiSearchAnalysisDocModel = {
	version: 1,
	analysisStartedAtMs: null,
	duration: null,
	usage: null,
	summary: '',
	query: '',
	webEnabled: false,
	topics: [],
	dashboardBlocks: [],
	sources: [],
	graph: null,
	topicInspectResults: {},
	topicAnalyzeResults: {},
	topicGraphResults: {},
	overviewMermaidActiveIndex: 0,
	overviewMermaidVersions: [],
};

function parseFrontmatter(raw: string): {
	created: string;
	title: string;
	query: string;
	webEnabled: boolean;
	duration: number | null;
	estimatedTokens: number | null;
	analysisStartedAt: number | null;
	runAnalysisMode: AnalysisMode | undefined;
} {
	const fmMatch = raw.match(REGEX_FRONTMATTER);
	if (!fmMatch) {
		return {
			created: '',
			title: '',
			query: '',
			webEnabled: false,
			duration: null,
			estimatedTokens: null,
			analysisStartedAt: null,
			runAnalysisMode: undefined,
		};
	}
	const fm = fmMatch[1];
	const getStr = (key: string): string => {
		const re = REGEX_YAML_KEY(key);
		const m = fm.match(re);
		if (!m) return '';
		let v = m[1].trim();
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
			v = v.slice(1, -1).replace(/\\"/g, '"');
		}
		return v;
	};
	const getNum = (key: string): number | null => {
		const s = getStr(key);
		if (!s) return null;
		const n = Number(s);
		return Number.isFinite(n) ? n : null;
	};
	const getBool = (key: string): boolean => {
		const s = getStr(key).toLowerCase();
		return s === 'true' || s === '1';
	};
	const runMode = getStr('runAnalysisMode').toLowerCase();
	const presetRaw = getStr('analysisPreset').toLowerCase();
	const runAnalysisMode: AnalysisMode | undefined =
		runMode === 'vaultfull' ? 'vaultFull' : runMode === 'aigraph' ? 'aiGraph'
			: presetRaw === 'vaultfull' ? 'vaultFull' : presetRaw === 'aigraph' ? 'aiGraph'
				// Legacy mapping: treat removed presets as vaultFull
				: (runMode === 'docsimple' || runMode === 'vaultsimple') ? 'vaultFull'
					: (presetRaw === 'docsimple' || presetRaw === 'vaultsimple') ? 'vaultFull'
						: undefined;
	return {
		created: getStr('created'),
		title: getStr('title'),
		query: getStr('query'),
		webEnabled: getBool('webEnabled'),
		duration: getNum('duration'),
		estimatedTokens: getNum('estimatedTokens'),
		analysisStartedAt: getNum('analysisStartedAt'),
		runAnalysisMode,
	};
}

/** Node types allowed when reconstructing a preview from mermaid (no type in syntax). */
const MERMAID_PREVIEW_NODE_TYPES: readonly GraphNodeType[] = [
	GraphNodeType.TopicTag,
	GraphNodeType.FunctionalTag,
	GraphNodeType.Document,
	GraphNodeType.Resource,
	GraphNodeType.Folder,
	GraphNodeType.HubDoc,
];

function parseMermaidToPreview(body: string): GraphPreview | null {
	const nodeLabelById = new Map<string, string>();
	const edges: Array<{ from: string; to: string }> = [];
	for (const rawLine of body.split('\n')) {
		const line = rawLine.trim();
		if (!line) continue;
		const nodeMatch = line.match(/^([A-Za-z0-9_]+)\["([\s\S]*?)"\]$/);
		if (nodeMatch) {
			nodeLabelById.set(nodeMatch[1], nodeMatch[2]);
			continue;
		}
		const edgeMatch = line.match(/^([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)\b/);
		if (edgeMatch) edges.push({ from: edgeMatch[1], to: edgeMatch[2] });
	}
	if (nodeLabelById.size === 0 && edges.length === 0) return null;
	return {
		nodes: Array.from(nodeLabelById.entries()).map(([id, label]) => ({
			id,
			label: label || id,
			type: GraphNodeType.Document,
		})),
		edges: edges.map((e) => ({ from_node_id: e.from, to_node_id: e.to, weight: 1 })),
	};
}

function extractMermaidBlock(text: string): string {
	const start = text.indexOf('```mermaid');
	if (start === -1) return '';
	const rest = text.slice(start + '```mermaid'.length);
	const end = rest.indexOf('```');
	if (end === -1) return '';
	return rest.slice(0, end).trim();
}

/** Extract all mermaid blocks from section text in order. */
function extractAllMermaidBlocks(text: string): string[] {
	const blocks: string[] = [];
	let remaining = text;
	while (remaining.length > 0) {
		const start = remaining.indexOf('```mermaid');
		if (start === -1) break;
		const rest = remaining.slice(start + '```mermaid'.length);
		const end = rest.indexOf('```');
		if (end === -1) break;
		blocks.push(rest.slice(0, end).trim());
		remaining = rest.slice(end + 3);
	}
	return blocks;
}

// ---------------------------------------------------------------------------
// V2 callout parsing helpers
// ---------------------------------------------------------------------------

/** Extract the full text of an Obsidian callout block from the body.
 *  Matches `> [!type]- title` (collapsed) or `> [!type] title` (open).
 *  Returns lines stripped of the leading `> ` prefix, or empty string if not found.
 */
function extractCalloutBlock(body: string, type: string, title: string): string {
	// Build regex that matches both collapsed (`-`) and non-collapsed variants
	const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`^> \\[!${type}\\]-?\\s+${escapedTitle}\\s*$`, 'm');
	const m = pattern.exec(body);
	if (!m) return '';
	const start = m.index + m[0].length;
	const rest = body.slice(start);
	// Collect continuation lines (lines starting with `> ` or blank `>`)
	const lines: string[] = [];
	// Skip the first split element — it's the remainder of the header line (always empty)
	const splitLines = rest.split('\n');
	for (let i = 1; i < splitLines.length; i++) {
		const line = splitLines[i];
		if (line === '>') {
			lines.push('');
		} else if (line.startsWith('> ')) {
			lines.push(line.slice(2));
		} else {
			break;
		}
	}
	return lines.join('\n').trim();
}

/** Parse list items from callout content (lines starting with `- `). */
function parseCalloutListItems(content: string): string[] {
	return content
		.split('\n')
		.filter((l) => l.trimStart().startsWith('- '))
		.map((l) => l.trimStart().slice(2).trim())
		.filter(Boolean);
}

/** Parse V2 numbered report sections (`## 1. Title`, `## 2. Title`, ...) from the body.
 *  Sections are between the Analysis Plan callout and the Sources heading.
 */
function parseV2ReportSections(body: string): Array<{ title: string; content: string }> {
	const sections: Array<{ title: string; content: string }> = [];
	const regex = /^## (\d+)\.\s+(.+)$/gm;
	let match: RegExpExecArray | null;
	const hits: Array<{ idx: number; num: number; title: string }> = [];
	while ((match = regex.exec(body)) !== null) {
		hits.push({ idx: match.index, num: parseInt(match[1], 10), title: match[2].trim() });
	}
	for (let i = 0; i < hits.length; i++) {
		const start = hits[i].idx + body.slice(hits[i].idx).indexOf('\n') + 1;
		const end = i + 1 < hits.length ? hits[i + 1].idx : body.length;
		let content = body.slice(start, end).trim();
		// Trim trailing callout blocks, H1 headings, or non-numbered H2 sections that may follow
		const nextSection = content.search(/\n(?:# [^#]|## [^0-9]|> \[!)/);
		if (nextSection >= 0) content = content.slice(0, nextSection).trim();
		sections.push({ title: hits[i].title, content });
	}
	return sections;
}

/**
 * Parse markdown content into AiSearchAnalysisDocModel.
 */
export function parse(raw: string): AiSearchAnalysisDocModel {
	const normalized = raw.replace(REGEX_CRLF, '\n');
	const fmMatch = normalized.match(REGEX_FRONTMATTER);
	const body = fmMatch ? fmMatch[2] : normalized;
	const fm = parseFrontmatter(normalized);

	const summary = extractSection(body, 'Summary');
	const querySectionRaw = extractSection(body, 'Query');
	// Strip V2 callout blocks and sub-headings from query section (they follow the query text)
	const querySection = querySectionRaw.replace(/\n(?:> \[!|## )[\s\S]*$/, '').trim();
	const query = querySection || fm.query;
	const overviewSection = extractSection(body, 'Overview');
	const overviewHistorySection = extractSection(body, 'Overview History');
	const mindflowSection = extractSection(body, 'Slot coverage') || extractSection(body, 'MindFlow');
	let overviewMermaidVersions: string[] = [];
	let overviewMermaidActiveIndex = 0;
	if (overviewHistorySection.trim()) {
		const blocks = extractAllMermaidBlocks(overviewHistorySection);
		const activeLine = overviewHistorySection.match(/^ActiveIndex:\s*(\d+)/m);
		overviewMermaidActiveIndex = activeLine ? Math.max(0, parseInt(activeLine[1], 10)) : 0;
		// Store raw inner content only; dedupe by content so one overview does not become multiple history entries
		const seen = new Set<string>();
		overviewMermaidVersions =
			blocks.length > 0
				? blocks
						.map((b) => getMermaidInner(b).trim())
						.filter((inner) => {
							if (!inner) return false;
							if (seen.has(inner)) return false;
							seen.add(inner);
							return true;
						})
				: [];
		if (overviewMermaidActiveIndex >= overviewMermaidVersions.length && overviewMermaidVersions.length > 0) {
			overviewMermaidActiveIndex = overviewMermaidVersions.length - 1;
		}
	}
	if (overviewMermaidVersions.length === 0 && overviewSection) {
		const single = extractMermaidBlock(overviewSection);
		if (single?.trim()) {
			overviewMermaidVersions = [getMermaidInner(single).trim()];
			overviewMermaidActiveIndex = 0;
		}
	}
	const mindflowMermaidRaw = extractMermaidBlock(mindflowSection);
	const mindflowMermaid = mindflowMermaidRaw?.trim()
		? (() => {
				const inner = getMermaidInner(mindflowMermaidRaw).trim();
				return inner ? inner : undefined;
		  })()
		: undefined;
	const topicsText = extractSection(body, 'Key Topics');
	const sourcesText = extractSection(body, 'Sources');
	const evidenceText = extractSection(body, 'Evidence');
	const inspectText = extractSection(body, 'Topic Inspect Results');
	const expansionsText = extractSection(body, 'Topic Expansions');
	const dashboardText = extractSection(body, 'Dashboard Blocks');
	const blockChatRecordsText = extractSection(body, 'Block Chat Records');
	const continueAnalysisText = extractSection(body, 'Continue Analysis');
	const graphFollowupsText = extractSection(body, 'Graph Follow-ups');
	const blocksFollowupsText = extractSection(body, 'Blocks Follow-ups');
	const blocksFollowupsByBlockIdText = extractSection(body, 'Blocks Follow-ups By Block');
	const sourcesFollowupsText = extractSection(body, 'Sources Follow-ups');
	const stepsText = extractSection(body, 'Steps');

	const topics: AISearchTopic[] = (() => {
		const lines = topicsText.split('\n');
		const result: AISearchTopic[] = [];
		let current: AISearchTopic | null = null;
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const isIndented = line.startsWith('  ');
			if (trimmed.startsWith('- ') && !isIndented) {
				const topicLine = trimmed.slice(2).trim();
				const label = topicLine.replace(/\s*\(weight:\s*[\d.]+\)\s*$/, '').trim();
				const weightMatch = topicLine.match(/\(weight:\s*([\d.]+)\)/);
				const weight = weightMatch ? Number(weightMatch[1]) : 1;
				current = { label, weight };
				result.push(current);
			} else if (isIndented && trimmed.startsWith('- ') && current) {
				const question = trimmed.slice(2).trim();
				if (question) {
					if (!current.suggestQuestions) current.suggestQuestions = [];
					current.suggestQuestions.push(question);
				}
			}
		}
		return result;
	})();

	const sources: AISearchSource[] = [];
	const sourceBlocks = sourcesText.split(/\n(?=- \[\[)/);
	for (let idx = 0; idx < sourceBlocks.length; idx++) {
		const block = sourceBlocks[idx].trim();
		if (!block) continue;
		const linkMatch = block.match(/^-\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*(?:\(score:\s*([\d.]+)\))?/);
		if (!linkMatch) continue;
		const path = (linkMatch[1] ?? '').trim();
		const title = (linkMatch[2] ?? path.split('/').pop() ?? path).trim();
		const scoreStr = linkMatch[3];
		const scoreVal = (scoreStr != null ? parseFloat(scoreStr) : 0) || 0;
		const badgesMatch = block.match(/^\s*badges:\s*(.+?)(?=\n|reasoning:|$)/m);
		const reasoningMatch = block.match(/reasoning:\s*(?:\|\s*)?\n([\s\S]*?)(?=\n- \[\[|$)/);
		const badges: string[] = badgesMatch
			? badgesMatch[1].trim().split(/[,\s]+/).filter(Boolean)
			: [];
		const reasoningRaw = reasoningMatch ? reasoningMatch[1] : '';
		const reasoning = reasoningRaw
			.split('\n')
			.map((l) => l.replace(/^\s{2,4}/, ''))
			.join('\n')
			.trim();
		sources.push({
			id: path ? `replay:${path}` : `replay:src:${idx}`,
			title: title || '(untitled)',
			path: path || '',
			reasoning,
			badges,
			score: { physical: scoreVal, semantic: scoreVal, average: scoreVal },
		});
	}

	const topicInspectResults: Record<string, SearchResultItem[]> = {};
	let currentTopic = '';
	for (const line of inspectText.split('\n')) {
		const topicMatch = line.match(/^##\s+(.+)$/);
		if (topicMatch) {
			currentTopic = topicMatch[1].trim();
			if (currentTopic && !topicInspectResults[currentTopic]) topicInspectResults[currentTopic] = [];
			continue;
		}
		const itemMatch = line.match(/^-\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
		if (itemMatch && currentTopic) {
			const path = (itemMatch[1] ?? '').trim();
			const title = (itemMatch[2] ?? path.split('/').pop() ?? path).trim();
			topicInspectResults[currentTopic].push({
				id: path ? `replay:${path}` : `replay:${topicInspectResults[currentTopic].length}`,
				type: 'markdown',
				title: title || '(untitled)',
				path: path || '',
				lastModified: Date.now(),
				source: 'local',
			});
		}
	}

	const topicAnalyzeResults: Record<string, SectionAnalyzeResult[]> = {};
	const topicGraphResults: Record<string, GraphPreview | null> = {};
	const topicBlocks = expansionsText.split(/\n##\s+/).filter(Boolean);
	for (const block of topicBlocks) {
		const firstLineEnd = block.indexOf('\n');
		let topicName = firstLineEnd === -1 ? block.trim() : block.slice(0, firstLineEnd).trim();
		if (topicName.startsWith('## ')) topicName = topicName.slice(3).trim();
		if (!topicName) continue;
		const rest = firstLineEnd === -1 ? '' : block.slice(firstLineEnd + 1);
		const analyzeMatch = rest.match(/###\s+Analyze\s*\n([\s\S]*?)(?=###\s+Graph|###\s+Analyze|##\s+|$)/);
		if (analyzeMatch) {
			const analyzeBody = analyzeMatch[1].trim();
			const qaList: SectionAnalyzeResult[] = [];
			const qRegex = /\*\*Q:\*\*\s*([\s\S]*?)(?=\*\*Q:\*\*|$)/g;
			let m: RegExpExecArray | null;
			while ((m = qRegex.exec(analyzeBody)) !== null) {
				const full = m[1].trim();
				const firstBr = full.indexOf('\n\n');
				const question = firstBr === -1 ? full : full.slice(0, firstBr).trim();
				const answer = firstBr === -1 ? '' : full.slice(firstBr + 2).trim();
				qaList.push({ question, answer });
			}
			if (qaList.length) topicAnalyzeResults[topicName] = qaList;
		}
		const graphMatch = rest.match(/###\s+Graph\s*\n([\s\S]*?)(?=###|##|$)/);
		if (graphMatch) {
			const preview = parseMermaidToPreview(extractMermaidBlock(graphMatch[1]));
			if (preview) topicGraphResults[topicName] = preview;
		}
	}

	const dashboardBlocks: DashboardBlock[] = [];
	const dbBlocks = dashboardText.split(/\n###\s+/).filter(Boolean);
	const RENDER_ENGINE_REGEX = /^renderEngine:\s*(MARKDOWN|TILE|ACTION_GROUP|MERMAID)\s*$/i;
	for (const blk of dbBlocks) {
		const firstLineEnd = blk.indexOf('\n');
		const title = firstLineEnd === -1 ? blk.trim() : blk.slice(0, firstLineEnd).trim();
		if (!title) continue;
		let content = firstLineEnd === -1 ? '' : blk.slice(firstLineEnd + 1).trim();
		// Restore renderEngine from first line so replay shows TILE/ACTION_GROUP correctly
		let renderEngine: DashboardBlock['renderEngine'] | null = null;
		const contentLines = content.split('\n');
		if (contentLines.length > 0) {
			const firstLine = contentLines[0].trim();
			const engineMatch = firstLine.match(RENDER_ENGINE_REGEX);
			if (engineMatch) {
				renderEngine = engineMatch[1].toUpperCase() as DashboardBlock['renderEngine'];
				content = contentLines.slice(1).join('\n').trim();
			}
		}
		const mermaidMatch = content.match(/```mermaid\n([\s\S]*?)```/);
		const items: Array<{ id: string; title: string; description?: string }> = [];
		for (const line of content.split('\n')) {
			const itemMatch = line.match(/^-\s+\*\*(.+?)\*\*:\s*(.*)$/);
			if (itemMatch) items.push({ id: itemMatch[1], title: itemMatch[1], description: itemMatch[2] || undefined });
		}
		dashboardBlocks.push({
			id: title,
			title,
			renderEngine: renderEngine ?? (mermaidMatch ? 'MERMAID' : 'MARKDOWN'),
			markdown: mermaidMatch ? undefined : content || undefined,
			mermaidCode: mermaidMatch ? mermaidMatch[1].trim() : undefined,
			items: items.length ? items : undefined,
		});
	}

	let blockChatRecords: Record<string, SnapshotChatMessage[]> | undefined;
	try {
		const raw = blockChatRecordsText.trim();
		if (raw) {
			const parsed = JSON.parse(raw) as Record<string, SnapshotChatMessage[]>;
			if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
				blockChatRecords = parsed;
			}
		}
	} catch {
		// ignore invalid JSON
	}

	// Knowledge Graph section no longer loaded from document (persistence removed).
	const graph: AISearchGraph | null = null;

	// Continue Analysis: sections are ## Question (H2); content follows and may contain ### (H3) and below
	const fullAnalysisFollowUp: Array<{ title: string; content: string }> = [];
	const continueBlocks = continueAnalysisText.split(/\n##\s+/).filter(Boolean);
	for (const blk of continueBlocks) {
		const firstLineEnd = blk.indexOf('\n');
		const firstLine = firstLineEnd === -1 ? blk.trim() : blk.slice(0, firstLineEnd).trim();
		const title = firstLine.replace(/^#+\s*/, '').trim();
		const content = firstLineEnd === -1 ? '' : blk.slice(firstLineEnd + 1).trim();
		if (title) fullAnalysisFollowUp.push({ title, content });
	}

	const parseFollowupHistory = (text: string): SectionAnalyzeResult[] => {
		const list: SectionAnalyzeResult[] = [];
		const blocks = text.split(/\n###\s+/).filter(Boolean);
		for (const blk of blocks) {
			const firstLineEnd = blk.indexOf('\n');
			const question = firstLineEnd === -1 ? blk.trim() : blk.slice(0, firstLineEnd).trim();
			const answer = firstLineEnd === -1 ? '' : blk.slice(firstLineEnd + 1).trim();
			if (question) list.push({ question, answer });
		}
		return list;
	};
	const graphFollowups = parseFollowupHistory(graphFollowupsText);
	const blocksFollowups = parseFollowupHistory(blocksFollowupsText);
	let blocksFollowupsByBlockId: Record<string, SectionAnalyzeResult[]> | undefined;
	try {
		const raw = blocksFollowupsByBlockIdText.trim();
		if (raw) {
			const parsed = JSON.parse(raw) as Record<string, SectionAnalyzeResult[]>;
			if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
				blocksFollowupsByBlockId = parsed;
			}
		}
	} catch {
		// ignore invalid JSON
	}
	const sourcesFollowups = parseFollowupHistory(sourcesFollowupsText);

	let evidenceIndex: EvidenceIndex | undefined;
	try {
		const raw = evidenceText.trim();
		if (raw) {
			const parsed = JSON.parse(raw) as EvidenceIndex;
			if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
				evidenceIndex = parsed;
			}
		}
	} catch {
		// ignore invalid JSON
	}

	const steps: UIStepRecord[] = [];
	const stepBlocks = stepsText.split(/\n###\s+Step\s+\d+:\s+/).filter(Boolean);
	for (let i = 0; i < stepBlocks.length; i++) {
		const blk = stepBlocks[i];
		const firstLineEnd = blk.indexOf('\n');
		const titleLine = firstLineEnd === -1 ? blk.trim() : blk.slice(0, firstLineEnd).trim();
		let rest = firstLineEnd === -1 ? '' : blk.slice(firstLineEnd + 1).trim();
		const title = titleLine || 'Step';
		const metaMatch = rest.match(/^\(startedAt:\s*([^,)]+),\s*endedAt:\s*([^)]+)\)\s*\n?/);
		let startedAtMs: number | undefined;
		let endedAtMs: number | undefined;
		if (metaMatch) {
			rest = rest.slice(metaMatch[0].length).trim();
			const startVal = metaMatch[1].trim();
			const endVal = metaMatch[2].trim();
			if (startVal !== '-') startedAtMs = Number(startVal);
			if (endVal !== '-') endedAtMs = Number(endVal);
		}
		steps.push({
			stepId: `step-${i + 1}`,
			title,
			description: rest ?? '',
			...(Number.isFinite(startedAtMs) && { startedAtMs }),
			...(Number.isFinite(endedAtMs) && { endedAtMs }),
		});
	}

	const usage: LLMUsage | null =
		fm.estimatedTokens != null
			? { inputTokens: 0, outputTokens: fm.estimatedTokens, totalTokens: fm.estimatedTokens }
			: null;

	// V2 callout parsing
	const v2ProcessLogContent = extractCalloutBlock(body, 'abstract', 'Process Log');
	const v2ProcessLog = v2ProcessLogContent ? parseCalloutListItems(v2ProcessLogContent) : undefined;

	const v2PlanOutlineRaw = extractCalloutBlock(body, 'note', 'Analysis Plan');
	const v2PlanOutline = v2PlanOutlineRaw || undefined;

	const v2GraphDataContent = extractCalloutBlock(body, 'tip', 'Graph Data');
	let v2GraphJson: string | undefined;
	if (v2GraphDataContent) {
		// Extract JSON from fenced code block inside callout
		const jsonMatch = v2GraphDataContent.match(/```json\n([\s\S]*?)```/);
		v2GraphJson = jsonMatch ? jsonMatch[1].trim() : undefined;
	}

	const v2FollowUpContent = extractCalloutBlock(body, 'question', 'Follow-up Questions');
	const v2FollowUpQuestions = v2FollowUpContent ? parseCalloutListItems(v2FollowUpContent) : undefined;

	const v2ReportSections = parseV2ReportSections(body);

	return {
		...EMPTY_DOC_MODEL,
		created: fm.created || undefined,
		title: fm.title?.trim() || undefined,
		query,
		webEnabled: fm.webEnabled,
		analysisStartedAtMs: fm.analysisStartedAt,
		duration: fm.duration,
		runAnalysisMode: fm.runAnalysisMode,
		usage,
		summary: summary || '',
		topics,
		sources,
		graph,
		topicInspectResults,
		topicAnalyzeResults,
		topicGraphResults,
		dashboardBlocks,
		blockChatRecords,
		fullAnalysisFollowUp: fullAnalysisFollowUp.length ? fullAnalysisFollowUp : undefined,
		graphFollowups: graphFollowups.length ? graphFollowups : undefined,
		blocksFollowups: blocksFollowups.length ? blocksFollowups : undefined,
		blocksFollowupsByBlockId,
		sourcesFollowups: sourcesFollowups.length ? sourcesFollowups : undefined,
		evidenceIndex,
		steps: steps.length ? steps : undefined,
		overviewMermaidVersions: overviewMermaidVersions.length ? overviewMermaidVersions : undefined,
		overviewMermaidActiveIndex: overviewMermaidVersions.length ? overviewMermaidActiveIndex : undefined,
		mindflowMermaid,
		v2ProcessLog: v2ProcessLog?.length ? v2ProcessLog : undefined,
		v2PlanOutline,
		v2ReportSections: v2ReportSections.length ? v2ReportSections : undefined,
		v2GraphJson,
		v2FollowUpQuestions: v2FollowUpQuestions?.length ? v2FollowUpQuestions : undefined,
	};
}

function escapeYamlScalar(value: string): string {
	const v = String(value ?? '').replace(/\r?\n/g, ' ').trim();
	return JSON.stringify(v);
}

/** Rebase markdown headings so the minimum level becomes baseLevel (1–6). Used so Continue Analysis answers start at H3. */
function rebaseHeadings(markdown: string, baseLevel: number): string {
	const lines = markdown.split('\n');
	let minLevel = 7;
	for (const line of lines) {
		const m = line.match(/^(#{1,6})\s+/);
		if (m) {
			const level = m[1].length;
			if (level < minLevel) minLevel = level;
		}
	}
	if (minLevel > 6) return markdown;
	const shift = baseLevel - minLevel;
	if (shift === 0) return markdown;
	const result: string[] = [];
	for (const line of lines) {
		const m = line.match(/^(#{1,6})(\s+.*)$/);
		if (m) {
			const newLevel = Math.min(6, Math.max(1, m[1].length + shift));
			result.push('#'.repeat(newLevel) + m[2]);
		} else {
			result.push(line);
		}
	}
	return result.join('\n');
}

function escapeMermaidLabel(label: string): string {
	return String(label ?? '')
		.replace(/"/g, '\\"')
		.replace(/\n/g, ' ')
		.slice(0, SLICE_CAPS.utils.mermaidQuotedLabel);
}

function buildMermaidBlock(graph: GraphPreview | null | undefined): string {
	if (!graph || !graph.nodes?.length) {
		return '```mermaid\nflowchart TD\n  A[No graph data]\n```';
	}
	const nodeIds = new Map<string, string>();
	graph.nodes.slice(0, SLICE_CAPS.vaultDoc.aiSearchAnalysisGraphNodes).forEach((n, idx) => nodeIds.set(n.id, `N${idx}`));
	const lines: string[] = ['```mermaid', 'flowchart TD'];
	for (const n of graph.nodes.slice(0, SLICE_CAPS.vaultDoc.aiSearchAnalysisGraphNodes)) {
		const id = nodeIds.get(n.id);
		if (!id) continue;
		lines.push(`  ${id}["${escapeMermaidLabel(n.label)}"]`);
	}
	for (const e of (graph.edges ?? []).slice(0, SLICE_CAPS.vaultDoc.aiSearchAnalysisGraphEdges)) {
		const from = nodeIds.get(e.from_node_id);
		const to = nodeIds.get(e.to_node_id);
		if (from && to) lines.push(`  ${from} --> ${to}`);
	}
	lines.push('```');
	return lines.join('\n');
}

function aiSearchGraphToGraphPreview(ai: AISearchGraph | null): GraphPreview | null {
	if (!ai) return null;
	return {
		nodes: ai.nodes.map((node) => ({
			id: node.id,
			label: node.title ?? node.id,
			type: (MERMAID_PREVIEW_NODE_TYPES.includes(node.type as GraphNodeType)
				? (node.type as GraphNodeType)
				: GraphNodeType.Document),
		})),
		edges: ai.edges.map((edge) => ({
			from_node_id: edge.source,
			to_node_id: edge.target,
			weight: edge.attributes?.weight ?? 1,
		})),
	};
}

/**
 * Build markdown from AiSearchAnalysisDocModel.
 * Use options to write sections only when relevant (e.g. full-only sections for vaultFull, Steps when dev tools on).
 */
export function buildMarkdown(docModel: AiSearchAnalysisDocModel, options?: BuildMarkdownOptions): string {
	const lines: string[] = [];
	const fullOnly = isFullAnalysisMode(options?.runAnalysisMode ?? docModel.runAnalysisMode);

	const pushFollowupHistory = (sectionTitle: string, items: SectionAnalyzeResult[] | undefined) => {
		if (!items?.length) return;
		lines.push(sectionTitle);
		lines.push('');
		for (const { question, answer } of items) {
			lines.push(`### ${question.replace(/\n/g, ' ').trim()}`);
			lines.push('');
			lines.push(answer);
			lines.push('');
		}
	};

	const now = docModel.created || new Date().toISOString();
	lines.push('---');
	lines.push('type: ai-search-result');
	lines.push(`version: 1`);
	lines.push(`created: ${now}`);
	if (docModel.title?.trim()) lines.push(`title: ${escapeYamlScalar(docModel.title.trim())}`);
	lines.push(`query: ${escapeYamlScalar(docModel.query)}`);
	lines.push(`webEnabled: ${docModel.webEnabled}`);
	if (docModel.runAnalysisMode) lines.push(`runAnalysisMode: ${docModel.runAnalysisMode}`);
	if (docModel.duration != null) lines.push(`duration: ${docModel.duration}`);
	if (docModel.usage?.totalTokens != null) lines.push(`estimatedTokens: ${docModel.usage.totalTokens}`);
	if (docModel.analysisStartedAtMs != null) lines.push(`analysisStartedAt: ${docModel.analysisStartedAtMs}`);
	lines.push('---');
	lines.push('');

	lines.push(SECTION_SUMMARY);
	lines.push('');
	lines.push(docModel.summary || '');
	lines.push('');

	lines.push(SECTION_QUERY);
	lines.push('');
	lines.push(docModel.query);
	lines.push('');

	// V2 callouts: Process Log and Analysis Plan (after Query, before V1 full-only sections)
	if (docModel.v2ProcessLog?.length) {
		lines.push('> [!abstract]- Process Log');
		for (const item of docModel.v2ProcessLog) {
			lines.push(`> - ${item}`);
		}
		lines.push('');
	}
	if (docModel.v2PlanOutline) {
		lines.push('> [!note]- Analysis Plan');
		for (const line of docModel.v2PlanOutline.split('\n')) {
			lines.push(line ? `> ${line}` : '>');
		}
		lines.push('');
	}

	// V2 numbered report sections (before Sources)
	if (docModel.v2ReportSections?.length) {
		for (let i = 0; i < docModel.v2ReportSections.length; i++) {
			const sec = docModel.v2ReportSections[i];
			lines.push(`## ${i + 1}. ${sec.title}`);
			lines.push('');
			lines.push(sec.content);
			lines.push('');
		}
	}

	if (fullOnly) {
		const overviewVersions = docModel.overviewMermaidVersions ?? [];
		const overviewActiveIndex = docModel.overviewMermaidActiveIndex ?? 0;
		// Only write Overview History; current overview = versions[activeIndex], no separate Overview section.
		if (overviewVersions.length > 0) {
			lines.push(SECTION_OVERVIEW_HISTORY);
			lines.push('');
			lines.push(`ActiveIndex: ${overviewActiveIndex}`);
			lines.push('');
			for (const m of overviewVersions) {
				if (m?.trim()) {
					lines.push('```mermaid');
					lines.push(m);
					lines.push('```');
					lines.push('');
				}
			}
		}
		const mindflow = (docModel.mindflowMermaid ?? '').trim();
		if (mindflow) {
			lines.push(SECTION_SLOT_MERMAID);
			lines.push('');
			lines.push('```mermaid');
			lines.push(mindflow);
			lines.push('```');
			lines.push('');
		}

		if (docModel.topics.length) {
			lines.push(SECTION_KEY_TOPICS);
			lines.push('');
			for (const t of docModel.topics) {
				lines.push(`- ${t.label}${t.weight != null ? ` (weight: ${t.weight})` : ''}`);
				if (t.suggestQuestions?.length) {
					for (const q of t.suggestQuestions) {
						lines.push(`  - ${q.replace(/\n/g, ' ').trim()}`);
					}
				}
			}
			lines.push('');
		}

		// Consulting report order: Dashboard Blocks before Sources
		if (docModel.dashboardBlocks.length > 0) {
			lines.push(SECTION_DASHBOARD);
			lines.push('');
			for (const b of docModel.dashboardBlocks) {
				const label = b.title || b.id;
				lines.push(`### ${label}`);
				lines.push(`renderEngine: ${b.renderEngine}`);
				if (b.markdown?.trim()) lines.push(b.markdown.trim());
				if (b.mermaidCode?.trim()) lines.push('```mermaid\n' + b.mermaidCode.trim() + '\n```');
				if (b.items?.length) {
					for (const item of b.items) {
						lines.push(`- **${item.title}**: ${item.description ?? ''}`);
					}
				}
				lines.push('');
			}
		}

		if (docModel.blockChatRecords && Object.keys(docModel.blockChatRecords).length > 0) {
			lines.push(SECTION_BLOCK_CHAT_RECORDS);
			lines.push('');
			lines.push(JSON.stringify(docModel.blockChatRecords));
			lines.push('');
		}
	}

	lines.push(SECTION_SOURCES);
	lines.push('');
	for (const s of docModel.sources) {
		const avg = s.score?.average ?? 0;
		lines.push(`- [[${s.path}|${s.title}]] (score: ${avg.toFixed(2)})`);
		if (s.badges?.length) lines.push(`  badges: ${s.badges.join(', ')}`);
		if (s.reasoning) lines.push(`  reasoning: |\n    ${s.reasoning.replace(/\n/g, '\n    ')}`);
	}
	lines.push('');

	// V2 trailing callouts: Graph Data and Follow-up Questions (after Sources)
	if (docModel.v2GraphJson) {
		lines.push('> [!tip]- Graph Data');
		lines.push('> ```json');
		for (const line of docModel.v2GraphJson.split('\n')) {
			lines.push(`> ${line}`);
		}
		lines.push('> ```');
		lines.push('');
	}
	if (docModel.v2FollowUpQuestions?.length) {
		lines.push('> [!question] Follow-up Questions');
		for (const q of docModel.v2FollowUpQuestions) {
			lines.push(`> - ${q}`);
		}
		lines.push('');
	}

	if (docModel.evidenceIndex && Object.keys(docModel.evidenceIndex).length > 0) {
		lines.push(SECTION_EVIDENCE);
		lines.push('');
		lines.push(JSON.stringify(docModel.evidenceIndex));
		lines.push('');
	}

	if (fullOnly && Object.keys(docModel.topicInspectResults).length > 0) {
		lines.push(SECTION_TOPIC_INSPECT);
		lines.push('');
		for (const [topic, items] of Object.entries(docModel.topicInspectResults)) {
			if (!items?.length) continue;
			lines.push(`## ${topic}`);
			lines.push('');
			for (const item of items) {
				lines.push(`- [[${item.path}|${item.title}]]`);
			}
			lines.push('');
		}
	}

	if (fullOnly) {
		const hasExpansions =
			Object.keys(docModel.topicAnalyzeResults).length > 0 ||
			Object.keys(docModel.topicGraphResults).length > 0;
		if (hasExpansions) {
			lines.push(SECTION_TOPIC_EXPANSIONS);
			lines.push('');
			const expansionTopics = new Set([
				...Object.keys(docModel.topicAnalyzeResults),
				...Object.keys(docModel.topicGraphResults),
			]);
			for (const topic of Array.from(expansionTopics)) {
				lines.push(`## ${topic}`);
				lines.push('');
				const qaList = docModel.topicAnalyzeResults[topic];
				if (qaList?.length) {
					lines.push('### Analyze');
					lines.push('');
					for (const qa of qaList) {
						lines.push(`**Q:** ${qa.question}`);
						lines.push('');
						lines.push(qa.answer);
						lines.push('');
					}
				}
				const topicGraph = docModel.topicGraphResults[topic];
				if (topicGraph && (topicGraph.nodes?.length > 0 || topicGraph.edges?.length > 0)) {
					lines.push('### Graph');
					lines.push('');
					lines.push(buildMermaidBlock(topicGraph));
					lines.push('');
				}
			}
		}

		// Knowledge Graph section no longer persisted (removed).

		pushFollowupHistory(SECTION_GRAPH_FOLLOWUPS, docModel.graphFollowups);
		if (docModel.blocksFollowupsByBlockId && Object.keys(docModel.blocksFollowupsByBlockId).length > 0) {
			lines.push(SECTION_BLOCKS_FOLLOWUPS_BY_BLOCK);
			lines.push('');
			lines.push(JSON.stringify(docModel.blocksFollowupsByBlockId));
			lines.push('');
		} else {
			pushFollowupHistory(SECTION_BLOCKS_FOLLOWUPS, docModel.blocksFollowups);
		}
	}

	pushFollowupHistory(SECTION_SOURCES_FOLLOWUPS, docModel.sourcesFollowups);

	// Continue Analysis: each question = H2; answer content rebased so all headings start at H3 (baseHeading 3)
	if (docModel.fullAnalysisFollowUp?.length) {
		const continueBaseHeading = 3;
		lines.push(SECTION_CONTINUE_ANALYSIS);
		lines.push('');
		for (const entry of docModel.fullAnalysisFollowUp) {
			lines.push(`## ${entry.title.replace(/\n/g, ' ').trim()}`);
			lines.push('');
			lines.push(rebaseHeadings(entry.content, continueBaseHeading));
			lines.push('');
		}
	}

	if (options?.includeSteps && (docModel.steps?.length ?? 0) > 0) {
		lines.push(SECTION_STEPS);
		lines.push('');
		for (let i = 0; i < docModel.steps!.length; i++) {
			const step = docModel.steps![i];
			lines.push(`### Step ${i + 1}: ${step.title}`);
			if (step.startedAtMs != null || step.endedAtMs != null) {
				lines.push(`(startedAt: ${step.startedAtMs ?? '-'}, endedAt: ${step.endedAtMs ?? '-'})`);
			}
			lines.push('');
			if (step.description?.trim()) lines.push(step.description.trim());
			lines.push('');
		}
	}

	return lines.join('\n');
}

/**
 * Convert DocModel to CompletedAnalysisSnapshot for store.
 */
export function toCompletedAnalysisSnapshot(
	docModel: AiSearchAnalysisDocModel,
	createdAtTs?: number
): CompletedAnalysisSnapshot {
	return {
		version: 1,
		title: docModel.title,
		summaries: (docModel.summaries?.length ? docModel.summaries : [docModel.summary]) as string[],
		summaryVersion: docModel.summaryVersion ?? 1,
		runAnalysisMode: docModel.runAnalysisMode,
		analysisStartedAtMs: docModel.analysisStartedAtMs ?? (Number.isFinite(createdAtTs ?? 0) ? (createdAtTs as number) : null),
		duration: docModel.duration,
		usage: docModel.usage,
		topics: docModel.topics,
		dashboardBlocks: docModel.dashboardBlocks,
		blockChatRecords: docModel.blockChatRecords,
		sources: docModel.sources,
		graph: docModel.graph,
		topicInspectResults: docModel.topicInspectResults,
		topicAnalyzeResults: docModel.topicAnalyzeResults,
		topicGraphResults: docModel.topicGraphResults,
		fullAnalysisFollowUp: docModel.fullAnalysisFollowUp,
		graphFollowups: docModel.graphFollowups,
		blocksFollowups: docModel.blocksFollowups,
		blocksFollowupsByBlockId: docModel.blocksFollowupsByBlockId,
		sourcesFollowups: docModel.sourcesFollowups,
		evidenceIndex: docModel.evidenceIndex && Object.keys(docModel.evidenceIndex).length > 0 ? docModel.evidenceIndex : undefined,
		steps: docModel.steps,
		overviewMermaidVersions: docModel.overviewMermaidVersions?.length ? docModel.overviewMermaidVersions : undefined,
		overviewMermaidActiveIndex: docModel.overviewMermaidVersions?.length ? (docModel.overviewMermaidActiveIndex ?? 0) : undefined,
		mindflowMermaid: docModel.mindflowMermaid?.trim() ? docModel.mindflowMermaid : undefined,
	};
}

/**
 * Convert CompletedAnalysisSnapshot to DocModel for saving.
 */
export function fromCompletedAnalysisSnapshot(
	snapshot: CompletedAnalysisSnapshot,
	query: string,
	webEnabled: boolean
): AiSearchAnalysisDocModel {
	return {
		version: 1,
		title: snapshot.title,
		summaryVersion: snapshot.summaryVersion ?? 1,
		summary: getSnapshotSummary(snapshot),
		summaries: snapshot.summaries?.length ? snapshot.summaries : undefined,
		analysisStartedAtMs: snapshot.analysisStartedAtMs ?? null,
		duration: snapshot.duration ?? null,
		usage: snapshot.usage ?? null,
		query,
		webEnabled,
		runAnalysisMode: snapshot.runAnalysisMode,
		topics: snapshot.topics ?? [],
		dashboardBlocks: snapshot.dashboardBlocks ?? [],
		blockChatRecords: snapshot.blockChatRecords,
		sources: snapshot.sources ?? [],
		graph: snapshot.graph ?? null,
		overviewMermaidVersions: (() => {
			const versions = snapshot.overviewMermaidVersions ?? [];
			const raw = snapshot.overviewMermaidActiveIndex as number | string | undefined;
			if (versions.length > 0) return versions;
			if (typeof raw === 'string' && String(raw).trim()) {
				const inner = getMermaidInner(raw).trim();
				return inner ? [inner] : [];
			}
			return [];
		})(),
		overviewMermaidActiveIndex: (() => {
			const versions = snapshot.overviewMermaidVersions ?? [];
			const raw = snapshot.overviewMermaidActiveIndex as number | string | undefined;
			if (versions.length > 0) return typeof raw === 'number' ? raw : 0;
			if (typeof raw === 'string' && String(raw).trim()) return 0;
			return 0;
		})(),
		topicInspectResults: snapshot.topicInspectResults ?? {},
		topicAnalyzeResults: snapshot.topicAnalyzeResults ?? {},
		topicGraphResults: snapshot.topicGraphResults ?? {},
		fullAnalysisFollowUp: snapshot.fullAnalysisFollowUp,
		graphFollowups: snapshot.graphFollowups,
		blocksFollowups: snapshot.blocksFollowups,
		blocksFollowupsByBlockId: snapshot.blocksFollowupsByBlockId,
		sourcesFollowups: snapshot.sourcesFollowups,
		evidenceIndex: snapshot.evidenceIndex && Object.keys(snapshot.evidenceIndex).length > 0 ? snapshot.evidenceIndex : undefined,
		steps: snapshot.steps,
		mindflowMermaid: snapshot.mindflowMermaid?.trim() ? snapshot.mindflowMermaid : undefined,
	};
}
