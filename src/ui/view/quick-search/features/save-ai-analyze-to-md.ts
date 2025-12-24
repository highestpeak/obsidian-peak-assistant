import type { App } from 'obsidian';
import type { AiAnalyzeResult, SearchResultItem } from '@/service/search/types';
import { ensureFolder } from '@/core/utils/vault-utils';

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

	const content = renderMarkdown({
		query: params.query,
		webEnabled: params.webEnabled === true,
		summary: params.result.summary,
		sources: params.result.sources,
		graph: params.result.insights?.graph,
		estimatedTokens: params.result.usage?.estimatedTokens,
	});

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

function renderMarkdown(params: {
	query: string;
	webEnabled: boolean;
	summary: string;
	sources: SearchResultItem[];
	graph?: { nodes: Array<{ id: string; label: string; kind: string }>; edges: Array<{ from: string; to: string; weight?: number }> };
	estimatedTokens?: number;
}): string {
	const now = new Date();
	const date = now.toISOString();
	const lines: string[] = [];
	lines.push('---');
	lines.push('type: ai-search-result');
	lines.push(`created: ${date}`);
	lines.push(`webEnabled: ${params.webEnabled ? 'true' : 'false'}`);
	if (params.estimatedTokens != null) lines.push(`estimatedTokens: ${params.estimatedTokens}`);
	lines.push('---');
	lines.push('');
	lines.push(`# AI Analysis`);
	lines.push('');
	lines.push(params.summary || '(empty)');
	lines.push('');
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
	lines.push(renderMermaid(params.graph));
	lines.push('');
	return lines.join('\\n');
}

import type { GraphPreview } from '@/core/storage/graph/types';

function renderMermaid(graph?: GraphPreview): string {
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


