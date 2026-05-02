/**
 * analysis-markdown-builder.ts
 * =============================
 * Build markdown from AiSearchAnalysisDocModel for vault persistence.
 * Extracted from AiSearchAnalysisDoc.ts — pure refactoring, no behavior changes.
 */

import { SLICE_CAPS } from '@/core/constant';
import type { AISearchGraph } from '@/service/agents/shared-types';
import type { GraphPreview } from '@/core/storage/graph/types';
import { GraphNodeType } from '@/core/po/graph.po';
import type { AnalysisMode, SectionAnalyzeResult } from '@/ui/view/quick-search/store/aiAnalysisStore';
import type { AiSearchAnalysisDocModel, BuildMarkdownOptions } from './AiSearchAnalysisDoc';
import { rebaseHeadings } from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

function isFullAnalysisMode(mode?: AnalysisMode): boolean {
	return mode === 'vaultFull';
}

function escapeYaml(value: string): string {
	const v = String(value ?? '').replace(/\r?\n/g, ' ').trim();
	return JSON.stringify(v);
}

function escapeMermaidLabel(label: string): string {
	return String(label ?? '')
		.replace(/"/g, '\\"')
		.replace(/\n/g, ' ')
		.slice(0, SLICE_CAPS.utils.mermaidQuotedLabel);
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

function pushFollowupHistory(b: MarkdownDocBuilder, sectionTitle: string, items: SectionAnalyzeResult[] | undefined) {
	if (!items?.length) return;
	b.heading(1, sectionTitle);
	b.blankLine();
	for (const { question, answer } of items) {
		b.heading(3, question.replace(/\n/g, ' ').trim());
		b.blankLine();
		b.text(answer);
		b.blankLine();
	}
}

/**
 * Build markdown from AiSearchAnalysisDocModel.
 * Use options to write sections only when relevant (e.g. full-only sections for vaultFull, Steps when dev tools on).
 */
export function buildMarkdown(docModel: AiSearchAnalysisDocModel, options?: BuildMarkdownOptions): string {
	const b = new MarkdownDocBuilder();
	const fullOnly = isFullAnalysisMode(options?.runAnalysisMode ?? docModel.runAnalysisMode);

	const now = docModel.created || new Date().toISOString();

	// Frontmatter
	const fmFields: Array<[string, string | number | boolean | undefined | null]> = [
		['type', 'ai-search-result'],
		['version', 1],
		['created', now],
	];
	if (docModel.title?.trim()) fmFields.push(['title', escapeYaml(docModel.title.trim())]);
	fmFields.push(['query', escapeYaml(docModel.query)]);
	fmFields.push(['webEnabled', docModel.webEnabled]);
	if (docModel.runAnalysisMode) fmFields.push(['runAnalysisMode', docModel.runAnalysisMode]);
	if (docModel.duration != null) fmFields.push(['duration', docModel.duration]);
	if (docModel.usage?.totalTokens != null) fmFields.push(['estimatedTokens', docModel.usage.totalTokens]);
	if (docModel.usage) {
		fmFields.push(['tokens_input', docModel.usage.inputTokens ?? 0]);
		fmFields.push(['tokens_output', docModel.usage.outputTokens ?? 0]);
		fmFields.push(['tokens_total', (docModel.usage.inputTokens ?? 0) + (docModel.usage.outputTokens ?? 0)]);
	}
	if (docModel.analysisStartedAtMs != null) fmFields.push(['analysisStartedAt', docModel.analysisStartedAtMs]);
	b.frontmatterRaw(fmFields);
	b.blankLine();

	// Summary
	b.heading(1, 'Summary');
	b.blankLine();
	b.text(docModel.summary || '');
	b.blankLine();

	// Query
	b.heading(1, 'Query');
	b.blankLine();
	b.text(docModel.query);
	b.blankLine();

	// V2 callouts: Process Log and Analysis Plan (after Query, before V1 full-only sections)
	if (docModel.v2ProcessLog?.length) {
		b.callout('abstract', 'Process Log', docModel.v2ProcessLog.map(i => `- ${i}`).join('\n'), true);
		b.blankLine();
	}
	if (docModel.v2PlanOutline) {
		b.callout('note', 'Analysis Plan', docModel.v2PlanOutline, true);
		b.blankLine();
	}

	// V2 numbered report sections (before Sources)
	if (docModel.v2ReportSections?.length) {
		for (let i = 0; i < docModel.v2ReportSections.length; i++) {
			const sec = docModel.v2ReportSections[i];
			b.heading(2, `${i + 1}. ${sec.title}`);
			b.blankLine();
			b.text(sec.content);
			b.blankLine();
		}
	}

	if (fullOnly) {
		const overviewVersions = docModel.overviewMermaidVersions ?? [];
		const overviewActiveIndex = docModel.overviewMermaidActiveIndex ?? 0;
		// Only write Overview History; current overview = versions[activeIndex], no separate Overview section.
		if (overviewVersions.length > 0) {
			b.heading(1, 'Overview History');
			b.blankLine();
			b.text(`ActiveIndex: ${overviewActiveIndex}`);
			b.blankLine();
			for (const m of overviewVersions) {
				if (m?.trim()) {
					b.mermaid(m);
					b.blankLine();
				}
			}
		}
		const mindflow = (docModel.mindflowMermaid ?? '').trim();
		if (mindflow) {
			b.heading(1, 'Slot coverage');
			b.blankLine();
			b.mermaid(mindflow);
			b.blankLine();
		}

		if (docModel.topics.length) {
			b.heading(1, 'Key Topics');
			b.blankLine();
			for (const t of docModel.topics) {
				b.text(`- ${t.label}${t.weight != null ? ` (weight: ${t.weight})` : ''}`);
				if (t.suggestQuestions?.length) {
					for (const q of t.suggestQuestions) {
						b.text(`  - ${q.replace(/\n/g, ' ').trim()}`);
					}
				}
			}
			b.blankLine();
		}

		// Consulting report order: Dashboard Blocks before Sources
		if (docModel.dashboardBlocks.length > 0) {
			b.heading(1, 'Dashboard Blocks');
			b.blankLine();
			for (const blk of docModel.dashboardBlocks) {
				const label = blk.title || blk.id;
				b.heading(3, label);
				b.text(`renderEngine: ${blk.renderEngine}`);
				if (blk.markdown?.trim()) b.text(blk.markdown.trim());
				if (blk.mermaidCode?.trim()) b.text('```mermaid\n' + blk.mermaidCode.trim() + '\n```');
				if (blk.items?.length) {
					for (const item of blk.items) {
						b.text(`- **${item.title}**: ${item.description ?? ''}`);
					}
				}
				b.blankLine();
			}
		}

		if (docModel.blockChatRecords && Object.keys(docModel.blockChatRecords).length > 0) {
			b.heading(1, 'Block Chat Records');
			b.blankLine();
			b.text(JSON.stringify(docModel.blockChatRecords));
			b.blankLine();
		}
	}

	// Sources
	b.heading(1, 'Sources');
	b.blankLine();
	for (const s of docModel.sources) {
		const avg = s.score?.average ?? 0;
		b.text(`- [[${s.path}|${s.title}]] (score: ${avg.toFixed(2)})`);
		if (s.badges?.length) b.text(`  badges: ${s.badges.join(', ')}`);
		if (s.reasoning) b.text(`  reasoning: |\n    ${s.reasoning.replace(/\n/g, '\n    ')}`);
	}
	b.blankLine();

	// V2 trailing callouts: Graph Data and Follow-up Questions (after Sources)
	if (docModel.v2GraphJson) {
		// Build Graph Data callout manually — inner content has a fenced code block
		b.text('> [!tip]- Graph Data');
		b.text('> ```json');
		for (const line of docModel.v2GraphJson.split('\n')) {
			b.text(`> ${line}`);
		}
		b.text('> ```');
		b.blankLine();
	}
	if (docModel.v2FollowUpQuestions?.length) {
		b.callout('question', 'Follow-up Questions', docModel.v2FollowUpQuestions.map(q => `- ${q}`).join('\n'), false);
		b.blankLine();
	}

	if (docModel.evidenceIndex && Object.keys(docModel.evidenceIndex).length > 0) {
		b.heading(1, 'Evidence');
		b.blankLine();
		b.text(JSON.stringify(docModel.evidenceIndex));
		b.blankLine();
	}

	if (fullOnly && Object.keys(docModel.topicInspectResults).length > 0) {
		b.heading(1, 'Topic Inspect Results');
		b.blankLine();
		for (const [topic, items] of Object.entries(docModel.topicInspectResults)) {
			if (!items?.length) continue;
			b.heading(2, topic);
			b.blankLine();
			for (const item of items) {
				b.text(`- [[${item.path}|${item.title}]]`);
			}
			b.blankLine();
		}
	}

	if (fullOnly) {
		const hasExpansions =
			Object.keys(docModel.topicAnalyzeResults).length > 0 ||
			Object.keys(docModel.topicGraphResults).length > 0;
		if (hasExpansions) {
			b.heading(1, 'Topic Expansions');
			b.blankLine();
			const expansionTopics = new Set([
				...Object.keys(docModel.topicAnalyzeResults),
				...Object.keys(docModel.topicGraphResults),
			]);
			for (const topic of Array.from(expansionTopics)) {
				b.heading(2, topic);
				b.blankLine();
				const qaList = docModel.topicAnalyzeResults[topic];
				if (qaList?.length) {
					b.heading(3, 'Analyze');
					b.blankLine();
					for (const qa of qaList) {
						b.text(`**Q:** ${qa.question}`);
						b.blankLine();
						b.text(qa.answer);
						b.blankLine();
					}
				}
				const topicGraph = docModel.topicGraphResults[topic];
				if (topicGraph && (topicGraph.nodes?.length > 0 || topicGraph.edges?.length > 0)) {
					b.heading(3, 'Graph');
					b.blankLine();
					b.text(buildMermaidBlock(topicGraph));
					b.blankLine();
				}
			}
		}

		// Knowledge Graph section no longer persisted (removed).

		pushFollowupHistory(b, 'Graph Follow-ups', docModel.graphFollowups);
		if (docModel.blocksFollowupsByBlockId && Object.keys(docModel.blocksFollowupsByBlockId).length > 0) {
			b.heading(1, 'Blocks Follow-ups By Block');
			b.blankLine();
			b.text(JSON.stringify(docModel.blocksFollowupsByBlockId));
			b.blankLine();
		}
	}

	pushFollowupHistory(b, 'Sources Follow-ups', docModel.sourcesFollowups);

	// Continue Analysis: each question = H2; answer content rebased so all headings start at H3 (baseHeading 3)
	if (docModel.fullAnalysisFollowUp?.length) {
		const continueBaseHeading = 3;
		b.heading(1, 'Continue Analysis');
		b.blankLine();
		for (const entry of docModel.fullAnalysisFollowUp) {
			b.heading(2, entry.title.replace(/\n/g, ' ').trim());
			b.blankLine();
			b.text(rebaseHeadings(entry.content, continueBaseHeading));
			b.blankLine();
		}
	}

	if (options?.includeSteps && (docModel.steps?.length ?? 0) > 0) {
		b.heading(1, 'Steps');
		b.blankLine();
		for (let i = 0; i < docModel.steps!.length; i++) {
			const step = docModel.steps![i];
			b.heading(3, `Step ${i + 1}: ${step.title}`);
			if (step.startedAtMs != null || step.endedAtMs != null) {
				b.text(`(startedAt: ${step.startedAtMs ?? '-'}, endedAt: ${step.endedAtMs ?? '-'})`);
			}
			b.blankLine();
			if (step.description?.trim()) b.text(step.description.trim());
			b.blankLine();
		}
	}

	return b.build();
}
