import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';
import { aiGraphDocSchema, type AiGraphDocData } from '@/core/schemas/ai-graph-schemas';
import { extractJsonBlock } from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

interface AiGraphDocModel {
	query: string;
	created: string;
	summary: string;
	graphData: LensGraphData;
	lensHint?: string;
}

function escapeYamlStr(s: string): string {
	return `"${s.replace(/"/g, '\\"')}"`;
}

export function buildAiGraphMarkdown(model: AiGraphDocModel): string {
	return new MarkdownDocBuilder()
		.frontmatterRaw([
			['type', 'ai-graph'],
			['query', escapeYamlStr(model.query)],
			['created', model.created],
			['lens', model.lensHint ?? 'topology'],
			['sources', model.graphData.nodes.length],
		])
		.blankLine()
		.heading(2, `AI Graph: ${model.query}`)
		.blankLine()
		.section(3, 'Summary', model.summary)
		.heading(3, 'Graph Data')
		.json(
			{
				nodes: model.graphData.nodes.map((n) => ({
					id: n.path,
					label: n.label,
					path: n.path,
					role: n.role,
					group: n.group,
					level: n.level,
					parentId: n.parentId,
					summary: n.summary,
				})),
				edges: model.graphData.edges.map((e) => ({
					source: e.source,
					target: e.target,
					kind: e.kind,
					weight: e.weight,
					label: e.label,
				})),
				lensHint: model.lensHint ?? 'topology',
			},
			2
		)
		.blankLine()
		.heading(3, 'Sources')
		.list(model.graphData.nodes.map((n) => `[[${n.path}]] — ${n.summary ?? n.label}`))
		.blankLine()
		.build();
}

export function parseAiGraphMarkdown(content: string): AiGraphDocData | null {
	const parsed = extractJsonBlock(content);
	if (!parsed) return null;
	try {
		return aiGraphDocSchema.parse(parsed);
	} catch {
		return null;
	}
}
