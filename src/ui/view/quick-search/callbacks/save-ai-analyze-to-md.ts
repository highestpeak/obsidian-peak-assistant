import type { App } from 'obsidian';
import type { AiAnalyzeResult, SearchResultItem } from '@/service/search/types';
import { ensureFolder } from '@/core/utils/vault-utils';
import type { GraphPreview } from '@/core/storage/graph/types';

/**
 * Save AI analysis result to a markdown file in the vault.
 */
export async function saveAiAnalyzeResultToMarkdown(app: App, params: {
	folderPath: string;
	fileName: string;
	query: string;
	result: Pick<AiAnalyzeResult, 'summary' | 'sources' | 'insights' | 'usage'>;
	webEnabled?: boolean;
}): Promise<{ path: string }> {
	const folder = params.folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
	const fileName = sanitizeFileName(params.fileName || 'AI Search Results');
	const fullFolderPath = folder.length ? folder : '';
	const filePath = fullFolderPath ? `${fullFolderPath}/${fileName}.md` : `${fileName}.md`;

	if (fullFolderPath) {
		await ensureFolder(app, fullFolderPath);
	}

	const graph = params.result.insights?.graph;
	const transformedGraph = graph ? {
		nodes: graph.nodes.map(node => ({
			id: node.id,
			label: node.label,
			kind: node.type
		})),
		edges: graph.edges.map(edge => ({
			from: edge.from_node_id,
			to: edge.to_node_id,
			weight: edge.weight
		}))
	} : undefined;

	const content = buildAiAnalyzeMarkdown({
		query: params.query,
		webEnabled: params.webEnabled === true,
		summary: params.result.summary,
		topics: params.result.insights?.topics,
		sources: params.result.sources,
		graph: transformedGraph,
		estimatedTokens: params.result.usage?.estimatedTokens,
	}, graph);

	const existing = app.vault.getAbstractFileByPath(filePath);
	let finalPath = filePath;
	if (existing) {
		// Avoid overwriting: suffix with timestamp.
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
		.replace(/\\s+/g, ' ')
		.slice(0, 120);
}

/**
 * Build a Markdown document for saving/copying AI analysis results.
 * Keep it compact enough for vault notes while still being useful.
 */
export function buildAiAnalyzeMarkdown(params: {
	query: string;
	webEnabled: boolean;
	summary: string;
	topics?: Array<{ label: string; weight: number }>;
	sources: SearchResultItem[];
	graph?: { nodes: Array<{ id: string; label: string; kind: string }>; edges: Array<{ from: string; to: string; weight?: number }> };
	estimatedTokens?: number;
}, originalGraph?: GraphPreview): string {
	const now = new Date();
	const date = now.toISOString();
	const lines: string[] = [];
	lines.push('---');
	lines.push('type: ai-search-result');
	lines.push(`created: ${date}`);
	lines.push(`query: ${escapeYamlScalar(params.query)}`);
	lines.push(`webEnabled: ${params.webEnabled ? 'true' : 'false'}`);
	if (params.estimatedTokens != null) lines.push(`estimatedTokens: ${params.estimatedTokens}`);
	lines.push('---');
	lines.push('');
	lines.push(`# AI Analysis`);
	lines.push('');
	lines.push(params.summary || '(empty)');
	lines.push('');
	if (params.topics?.length) {
		lines.push(`# Key Topics`);
		lines.push('');
		for (const t of params.topics) {
			lines.push(`- ${t.label}${t.weight != null ? ` (weight: ${t.weight})` : ''}`);
		}
		lines.push('');
	}
	lines.push(`# Query`);
	lines.push('');
	lines.push(params.query);
	lines.push('');
	lines.push(`# Sources`);
	lines.push('');
	for (const s of params.sources) {
		const snippet = s.highlight?.text || s.content || '';
		const score = s.finalScore ?? s.score;
		lines.push(`- [[${s.path}|${s.title}]]${score != null ? ` (score: ${score.toFixed(2)})` : ''}`);
		if (snippet) {
			lines.push(`  - ${snippet.replace(/\\n/g, ' ').slice(0, 300)}`);
		}
	}
	lines.push('');
	lines.push(`# Knowledge Graph`);
	lines.push('');
	lines.push(buildMermaidBlock(originalGraph));
	lines.push('');
	return lines.join('\\n');
}

export function buildMermaidBlock(graph?: GraphPreview): string {
	if (!graph || !graph.nodes?.length) {
		return '```mermaid\\nflowchart TD\\n  A[No graph data]\\n```';
	}

	// Map arbitrary ids to stable mermaid-safe ids.
	const nodeIds = new Map<string, string>();
	graph.nodes.slice(0, 40).forEach((n, idx) => nodeIds.set(n.id, `N${idx}`));

	const lines: string[] = [];
	lines.push('```mermaid');
	lines.push('flowchart TD');
	for (const n of graph.nodes.slice(0, 40)) {
		const id = nodeIds.get(n.id);
		if (!id) continue;
		const label = escapeMermaidLabel(n.label);
		lines.push(`  ${id}["${label}"]`);
	}
	for (const e of graph.edges.slice(0, 80)) {
		const from = nodeIds.get(e.from_node_id);
		const to = nodeIds.get(e.to_node_id);
		if (!from || !to) continue;
		lines.push(`  ${from} --> ${to}`);
	}
	lines.push('```');
	return lines.join('\\n');
}

function escapeMermaidLabel(label: string): string {
	return String(label ?? '')
		.replace(/\"/g, '\\\\\"')
		.replace(/\\n/g, ' ')
		.slice(0, 80);
}

function escapeYamlScalar(value: string): string {
	const v = String(value ?? '').replace(/\\r?\\n/g, ' ').trim();
	return JSON.stringify(v);
}


