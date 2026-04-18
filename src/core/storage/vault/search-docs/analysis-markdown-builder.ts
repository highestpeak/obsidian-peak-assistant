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

const SECTION_SUMMARY = '# Summary';
const SECTION_QUERY = '# Query';
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

function isFullAnalysisMode(mode?: AnalysisMode): boolean {
	return mode === 'vaultFull';
}

function escapeYamlScalar(value: string): string {
	const v = String(value ?? '').replace(/\r?\n/g, ' ').trim();
	return JSON.stringify(v);
}

/** Rebase markdown headings so the minimum level becomes baseLevel (1-6). Used so Continue Analysis answers start at H3. */
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
	if (docModel.usage) {
		lines.push(`tokens_input: ${docModel.usage.inputTokens ?? 0}`);
		lines.push(`tokens_output: ${docModel.usage.outputTokens ?? 0}`);
		lines.push(`tokens_total: ${(docModel.usage.inputTokens ?? 0) + (docModel.usage.outputTokens ?? 0)}`);
	}
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
		// assumes compact single-line JSON — multi-line JSON would break callout round-trip
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
