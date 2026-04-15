import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';
import { aiGraphDocSchema, type AiGraphDocData } from '@/core/schemas/ai-graph-schemas';

interface AiGraphDocModel {
	query: string;
	created: string;
	summary: string;
	graphData: LensGraphData;
	lensHint?: string;
}

export function buildAiGraphMarkdown(model: AiGraphDocModel): string {
	const lines: string[] = [
		'---',
		`type: ai-graph`,
		`query: "${model.query.replace(/"/g, '\\"')}"`,
		`created: ${model.created}`,
		`lens: ${model.lensHint ?? 'topology'}`,
		`sources: ${model.graphData.nodes.length}`,
		'---',
		'',
		`## AI Graph: ${model.query}`,
		'',
		'### Summary',
		model.summary,
		'',
		'### Graph Data',
		'```json',
		JSON.stringify(
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
			null,
			2
		),
		'```',
		'',
		'### Sources',
		...model.graphData.nodes.map((n) => `- [[${n.path}]] — ${n.summary ?? n.label}`),
		'',
	];
	return lines.join('\n');
}

export function parseAiGraphMarkdown(content: string): AiGraphDocData | null {
	const jsonMatch = content.match(/```json\n([\s\S]*?)```/);
	if (!jsonMatch) return null;
	try {
		const parsed = JSON.parse(jsonMatch[1]);
		return aiGraphDocSchema.parse(parsed);
	} catch {
		return null;
	}
}
