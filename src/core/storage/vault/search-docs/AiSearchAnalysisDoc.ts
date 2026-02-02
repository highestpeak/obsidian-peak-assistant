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
 *   Topic Expansions, Dashboard Blocks, Knowledge Graph
 *
 * Run with: npx tsx src/core/storage/vault/search-docs/test/AiSearchAnalysisDoc.test.ts
 */

import type { AISearchGraph, AISearchSource, AISearchTopic, DashboardBlock } from '@/service/agents/AISearchAgent';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { SearchResultItem } from '@/service/search/types';
import type { LLMUsage } from '@/core/providers/types';
import type { AnalysisMode, AIAnalysisStep, CompletedAnalysisSnapshot, SectionAnalyzeResult } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { getSnapshotSummary } from '@/ui/view/quick-search/store/aiAnalysisStore';
import type { GraphNodeType } from '@/core/po/graph.po';

const SECTION_SUMMARY = '# Summary';
const SECTION_QUERY = '# Query';
const SECTION_KEY_TOPICS = '# Key Topics';
const SECTION_SOURCES = '# Sources';
const SECTION_TOPIC_INSPECT = '# Topic Inspect Results';
const SECTION_TOPIC_EXPANSIONS = '# Topic Expansions';
const SECTION_DASHBOARD = '# Dashboard Blocks';
const SECTION_KNOWLEDGE_GRAPH = '# Knowledge Graph';
const SECTION_CONTINUE_ANALYSIS = '# Continue Analysis';
const SECTION_GRAPH_FOLLOWUPS = '# Graph Follow-ups';
const SECTION_BLOCKS_FOLLOWUPS = '# Blocks Follow-ups';
const SECTION_BLOCKS_FOLLOWUPS_BY_BLOCK = '# Blocks Follow-ups By Block';
const SECTION_SOURCES_FOLLOWUPS = '# Sources Follow-ups';
const SECTION_STEPS = '# Steps';

const REGEX_FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const REGEX_YAML_KEY = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, 'm');
const REGEX_CRLF = /\r\n/g;

/** Document model for AI search analysis. Matches CompletedAnalysisSnapshot plus query/webEnabled. */
export interface AiSearchAnalysisDocModel {
	version: 1;
	/** Summary content version; every snapshot has one (e.g. 1). */
	summaryVersion?: number;
	created?: string;
	analysisStartedAtMs: number | null;
	duration: number | null;
	usage: LLMUsage | null;
	/** Selected summary for md body (summaries[summaryVersion - 1]). */
	summary: string;
	/** All generated summaries. */
	summaries?: string[];
	query: string;
	webEnabled: boolean;
	runAnalysisMode?: AnalysisMode;
	topics: AISearchTopic[];
	dashboardBlocks: DashboardBlock[];
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
	/** All analysis steps for replay. */
	steps?: AIAnalysisStep[];
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
};

function extractSection(raw: string, sectionTitle: string): string {
	const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`^#{1,3}\\s+${escapeRegExp(sectionTitle)}\\s*$`, 'm');
	const m = pattern.exec(raw);
	if (!m) return '';
	const start = m.index + m[0].length;
	const after = raw.slice(start);
	const nextSectionStart = after.search(/\n#\s+\S/);
	const end = nextSectionStart >= 0 ? nextSectionStart : after.length;
	return after.slice(0, end).trim();
}

function parseFrontmatter(raw: string): {
	created: string;
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
	const runAnalysisMode: AnalysisMode | undefined =
		runMode === 'simple' || runMode === 'full' ? runMode : undefined;
	return {
		created: getStr('created'),
		query: getStr('query'),
		webEnabled: getBool('webEnabled'),
		duration: getNum('duration'),
		estimatedTokens: getNum('estimatedTokens'),
		analysisStartedAt: getNum('analysisStartedAt'),
		runAnalysisMode,
	};
}

function parseMermaidToGraph(body: string): AISearchGraph | null {
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
			type: 'concept',
			title: label || id,
			path: undefined,
			attributes: {},
		})),
		edges: edges.map((e) => ({
			id: `${e.from}->${e.to}`,
			source: e.from,
			target: e.to,
			type: 'link',
			attributes: { weight: 1 },
		})),
	};
}

function parseMermaidToPreview(body: string): GraphPreview | null {
	const allowedTypes: GraphNodeType[] = ['document', 'tag', 'category', 'concept', 'link', 'resource', 'custom'];
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
			type: (allowedTypes.includes('document') ? 'document' : 'document') as GraphNodeType,
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

/**
 * Parse markdown content into AiSearchAnalysisDocModel.
 */
export function parse(raw: string): AiSearchAnalysisDocModel {
	const normalized = raw.replace(REGEX_CRLF, '\n');
	const fmMatch = normalized.match(REGEX_FRONTMATTER);
	const body = fmMatch ? fmMatch[2] : normalized;
	const fm = parseFrontmatter(normalized);

	const summary = extractSection(body, 'Summary');
	const querySection = extractSection(body, 'Query');
	const query = querySection || fm.query;
	const topicsText = extractSection(body, 'Key Topics');
	const sourcesText = extractSection(body, 'Sources');
	const inspectText = extractSection(body, 'Topic Inspect Results');
	const expansionsText = extractSection(body, 'Topic Expansions');
	const dashboardText = extractSection(body, 'Dashboard Blocks');
	const graphText = extractSection(body, 'Knowledge Graph');
	const continueAnalysisText = extractSection(body, 'Continue Analysis');
	const graphFollowupsText = extractSection(body, 'Graph Follow-ups');
	const blocksFollowupsText = extractSection(body, 'Blocks Follow-ups');
	const blocksFollowupsByBlockIdText = extractSection(body, 'Blocks Follow-ups By Block');
	const sourcesFollowupsText = extractSection(body, 'Sources Follow-ups');
	const stepsText = extractSection(body, 'Steps');

	const topics: AISearchTopic[] = topicsText
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.startsWith('- '))
		.map((l) => {
			const label = l.slice(2).trim().replace(/\s*\(weight:\s*[\d.]+\)\s*$/, '').trim();
			const weightMatch = l.match(/\(weight:\s*([\d.]+)\)/);
			const weight = weightMatch ? Number(weightMatch[1]) : 1;
			return { label, weight };
		});

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
			slot: 'MAIN',
			renderEngine: renderEngine ?? (mermaidMatch ? 'MERMAID' : 'MARKDOWN'),
			markdown: mermaidMatch ? undefined : content || undefined,
			mermaidCode: mermaidMatch ? mermaidMatch[1].trim() : undefined,
			items: items.length ? items : undefined,
		});
	}

	const graphBody = extractMermaidBlock(graphText);
	const graph = graphBody ? parseMermaidToGraph(graphBody) : null;

	const fullAnalysisFollowUp: Array<{ title: string; content: string }> = [];
	const continueBlocks = continueAnalysisText.split(/\n###\s+/).filter(Boolean);
	for (const blk of continueBlocks) {
		const firstLineEnd = blk.indexOf('\n');
		const title = firstLineEnd === -1 ? blk.trim() : blk.slice(0, firstLineEnd).trim();
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

	const steps: AIAnalysisStep[] = [];
	const stepBlocks = stepsText.split(/\n###\s+Step\s+\d+:\s+/).filter(Boolean);
	for (const blk of stepBlocks) {
		const firstLineEnd = blk.indexOf('\n');
		const typeLine = firstLineEnd === -1 ? blk.trim() : blk.slice(0, firstLineEnd).trim();
		let rest = firstLineEnd === -1 ? '' : blk.slice(firstLineEnd + 1).trim();
		const type = typeLine || 'idle';
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
			type: type as AIAnalysisStep['type'],
			textChunks: rest ? [rest] : [],
			...(Number.isFinite(startedAtMs) && { startedAtMs }),
			...(Number.isFinite(endedAtMs) && { endedAtMs }),
		});
	}

	const usage: LLMUsage | null =
		fm.estimatedTokens != null
			? { inputTokens: 0, outputTokens: fm.estimatedTokens, totalTokens: fm.estimatedTokens }
			: null;

	return {
		...EMPTY_DOC_MODEL,
		created: fm.created || undefined,
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
		fullAnalysisFollowUp: fullAnalysisFollowUp.length ? fullAnalysisFollowUp : undefined,
		graphFollowups: graphFollowups.length ? graphFollowups : undefined,
		blocksFollowups: blocksFollowups.length ? blocksFollowups : undefined,
		blocksFollowupsByBlockId,
		sourcesFollowups: sourcesFollowups.length ? sourcesFollowups : undefined,
		steps: steps.length ? steps : undefined,
	};
}

function escapeYamlScalar(value: string): string {
	const v = String(value ?? '').replace(/\r?\n/g, ' ').trim();
	return JSON.stringify(v);
}

function escapeMermaidLabel(label: string): string {
	return String(label ?? '')
		.replace(/"/g, '\\"')
		.replace(/\n/g, ' ')
		.slice(0, 80);
}

function buildMermaidBlock(graph: GraphPreview | null | undefined): string {
	if (!graph || !graph.nodes?.length) {
		return '```mermaid\nflowchart TD\n  A[No graph data]\n```';
	}
	const nodeIds = new Map<string, string>();
	graph.nodes.slice(0, 40).forEach((n, idx) => nodeIds.set(n.id, `N${idx}`));
	const lines: string[] = ['```mermaid', 'flowchart TD'];
	for (const n of graph.nodes.slice(0, 40)) {
		const id = nodeIds.get(n.id);
		if (!id) continue;
		lines.push(`  ${id}["${escapeMermaidLabel(n.label)}"]`);
	}
	for (const e of graph.edges.slice(0, 80)) {
		const from = nodeIds.get(e.from_node_id);
		const to = nodeIds.get(e.to_node_id);
		if (from && to) lines.push(`  ${from} --> ${to}`);
	}
	lines.push('```');
	return lines.join('\n');
}

function aiSearchGraphToGraphPreview(ai: AISearchGraph | null): GraphPreview | null {
	if (!ai) return null;
	const allowedTypes: GraphNodeType[] = ['document', 'tag', 'category', 'concept', 'link', 'resource', 'custom'];
	return {
		nodes: ai.nodes.map((node) => ({
			id: node.id,
			label: node.title ?? node.id,
			type: (allowedTypes.includes(node.type as GraphNodeType) ? node.type : 'document') as GraphNodeType,
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
 */
export function buildMarkdown(docModel: AiSearchAnalysisDocModel): string {
	const lines: string[] = [];
	const now = docModel.created || new Date().toISOString();
	lines.push('---');
	lines.push('type: ai-search-result');
	lines.push(`version: 1`);
	lines.push(`created: ${now}`);
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
	lines.push(docModel.summary || '(empty)');
	lines.push('');

	lines.push(SECTION_QUERY);
	lines.push('');
	lines.push(docModel.query);
	lines.push('');

	if (docModel.topics.length) {
		lines.push(SECTION_KEY_TOPICS);
		lines.push('');
		for (const t of docModel.topics) {
			lines.push(`- ${t.label}${t.weight != null ? ` (weight: ${t.weight})` : ''}`);
		}
		lines.push('');
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

	if (Object.keys(docModel.topicInspectResults).length > 0) {
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

	if (docModel.dashboardBlocks.length > 0) {
		lines.push(SECTION_DASHBOARD);
		lines.push('');
		for (const b of docModel.dashboardBlocks) {
			const label = b.title || b.category || b.id;
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

	lines.push(SECTION_KNOWLEDGE_GRAPH);
	lines.push('');
	const graphPreview = docModel.graph ? aiSearchGraphToGraphPreview(docModel.graph) : null;
	lines.push(buildMermaidBlock(graphPreview));
	lines.push('');

	if (docModel.fullAnalysisFollowUp?.length) {
		lines.push(SECTION_CONTINUE_ANALYSIS);
		lines.push('');
		for (const entry of docModel.fullAnalysisFollowUp) {
			lines.push(`### ${entry.title}`);
			lines.push('');
			lines.push(entry.content);
			lines.push('');
		}
	}

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
	pushFollowupHistory(SECTION_GRAPH_FOLLOWUPS, docModel.graphFollowups);
	if (docModel.blocksFollowupsByBlockId && Object.keys(docModel.blocksFollowupsByBlockId).length > 0) {
		lines.push(SECTION_BLOCKS_FOLLOWUPS_BY_BLOCK);
		lines.push('');
		lines.push(JSON.stringify(docModel.blocksFollowupsByBlockId));
		lines.push('');
	} else {
		pushFollowupHistory(SECTION_BLOCKS_FOLLOWUPS, docModel.blocksFollowups);
	}
	pushFollowupHistory(SECTION_SOURCES_FOLLOWUPS, docModel.sourcesFollowups);

	if (docModel.steps?.length) {
		lines.push(SECTION_STEPS);
		lines.push('');
		for (let i = 0; i < docModel.steps.length; i++) {
			const step = docModel.steps[i];
			const body = (step.textChunks ?? []).join('').trim();
			lines.push(`### Step ${i + 1}: ${step.type}`);
			if (step.startedAtMs != null || step.endedAtMs != null) {
				lines.push(`(startedAt: ${step.startedAtMs ?? '-'}, endedAt: ${step.endedAtMs ?? '-'})`);
			}
			lines.push('');
			if (body) lines.push(body);
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
		summaries: (docModel.summaries?.length ? docModel.summaries : [docModel.summary]) as string[],
		summaryVersion: docModel.summaryVersion ?? 1,
		runAnalysisMode: docModel.runAnalysisMode,
		analysisStartedAtMs: docModel.analysisStartedAtMs ?? (Number.isFinite(createdAtTs ?? 0) ? (createdAtTs as number) : null),
		duration: docModel.duration,
		usage: docModel.usage,
		topics: docModel.topics,
		dashboardBlocks: docModel.dashboardBlocks,
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
		steps: docModel.steps,
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
		sources: snapshot.sources ?? [],
		graph: snapshot.graph ?? null,
		topicInspectResults: snapshot.topicInspectResults ?? {},
		topicAnalyzeResults: snapshot.topicAnalyzeResults ?? {},
		topicGraphResults: snapshot.topicGraphResults ?? {},
		fullAnalysisFollowUp: snapshot.fullAnalysisFollowUp,
		graphFollowups: snapshot.graphFollowups,
		blocksFollowups: snapshot.blocksFollowups,
		blocksFollowupsByBlockId: snapshot.blocksFollowupsByBlockId,
		sourcesFollowups: snapshot.sourcesFollowups,
		steps: snapshot.steps,
	};
}
