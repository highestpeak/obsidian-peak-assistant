import type { AISearchGraph, AISearchSource, AISearchTopic, DashboardBlock } from '@/service/agents/AISearchAgent';
import type { AIAnalysisHistoryRecord } from '@/service/AIAnalysisHistoryService';
import type { CompletedAnalysisSnapshot } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { buildMarkdown, fromCompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
import type { SearchResultItem } from '@/service/search/types';
import type { GraphPreview } from '@/core/storage/graph/types';

/** Record shape used by tab-AISearch for Recent AI Analysis list (matches ai_analysis_record) */
export interface MockAIAnalysisRecord {
	id: string;
	vault_rel_path: string;
	query: string | null;
	title: string | null;
	created_at_ts: number;
	web_enabled: number;
	estimated_tokens: number | null;
	sources_count: number | null;
	topics_count: number | null;
	graph_nodes_count: number | null;
	graph_edges_count: number | null;
	duration: number | null;
}

const sampleQueries = [
	'How does knowledge graph work?',
	'Project setup and dev workflow',
	'Explain LLM tokenization.',
	'How to organize notes effectively?',
	'What is prompt engineering?',
	'Show recent changes in vault.',
	'What are relevant PKM tags?',
	'Compare semantic search vs keyword search.',
	'How to review highlights quickly?',
	'Best practices for AI-powered note-taking.'
];

const samplePaths = [
	'Analysis/AI Searches/mock-knowledge-graph.md',
	'Analysis/AI Searches/mock-project-setup.md',
	'Analysis/AI Searches/mock-tokenization.md',
	'Analysis/AI Searches/mock-note-organization.md',
	'Analysis/AI Searches/mock-prompt-engineering.md',
	'Analysis/AI Searches/mock-recent-changes.md',
	'Analysis/AI Searches/mock-tags.md',
	'Analysis/AI Searches/mock-search-comparison.md',
	'Analysis/AI Searches/mock-highlight-review.md',
	'Analysis/AI Searches/mock-best-practices.md'
];

const makeRandomInt = (min: number, max: number) =>
	Math.floor(Math.random() * (max - min + 1)) + min;

const getRandomElement = <T,>(arr: T[]) =>
	arr[Math.floor(Math.random() * arr.length)];

const MARKDOWN_VARIANTS = [
	'### Summary\n\nThis analysis identified **key patterns** and **connections** between notes.\n\n- Bullet point one\n- Bullet point two\n- Bullet point three',
	'**Key takeaways:**\n\n1. First finding supports the main hypothesis\n2. Second finding reveals edge cases\n3. Third finding suggests future work',
	'| Aspect | Before | After |\n|--------|--------|-------|\n| Coverage | 60% | 85% |\n| Clarity | Low | High |',
	'| Topic | Relevance | Notes |\n|-------|-----------|-------|\n| Architecture | High | Core pattern identified |\n| Testing | Medium | Needs follow-up |\n| Docs | Low | Optional |',
	'```\nRecommended next steps:\n- Verify assumptions\n- Run integration tests\n- Document decisions\n```',
	'> Important: Cross-reference with related notes before making changes.',
	'This analysis uncovered several important patterns. The primary finding suggests a modular architecture with clear boundaries between services. Cross-referencing with related notes reveals consistent themes around testing and documentation.',
	'> Key insight: The evidence points toward an incremental migration strategy.\n\nThe team should first identify high-impact modules, then refactor in small batches. Documentation should be updated in parallel to avoid drift.',
	'Recommended approach:\n\n```\n1. Verify assumptions with stakeholders\n2. Run integration tests in staging\n3. Document decisions in ADRs\n```\n\nProceed with caution in production environments.',
];

const MERMAID_VARIANTS = [
	'flowchart LR\n  A[Input] --> B[Process]\n  B --> C[Output]\n  B --> D[Review]',
	'flowchart TD\n  Root[Root Concept]\n  C1[Child 1]\n  C2[Child 2]\n  Root --> C1\n  Root --> C2\n  C1 --> C2',
	'flowchart TB\n  subgraph Core\n    A[Service]\n    B[Database]\n  end\n  subgraph Extras\n    C[Cache]\n  end\n  A --> B\n  A --> C',
	'sequenceDiagram\n  User->>System: Request\n  System->>DB: Query\n  DB-->>System: Result\n  System-->>User: Response',
	'graph TD\n  Idea[Main Idea] --> P1[Point 1]\n  Idea --> P2[Point 2]\n  P1 --> Detail[A supporting detail]',
	'pie title Relevance Distribution\n    "High" : 45\n    "Medium" : 35\n    "Low" : 20',
	'xychart\n    title Scores by Category\n    x-axis [Arch, Test, Docs]\n    y-axis 0 --> 100\n    bar [85, 60, 40]',
	'xychart\n    title Trend\n    x-axis [Q1, Q2, Q3, Q4]\n    y-axis 0 --> 100\n    line [30, 50, 70, 85]',
];

const BLOCK_TEMPLATES: Array<(baseId: string, i: number) => DashboardBlock> = [
	(baseId) => ({
		id: baseId,
		title: 'Key Insights',
		weight: 2,
		renderEngine: 'TILE',
		items: [
			{ id: 'i1', title: 'Primary Finding', description: 'Main takeaway from the analysis.', icon: 'Lightbulb', color: '#7c3aed' },
			{ id: 'i2', title: 'Related Concept', description: 'Connected idea worth exploring.', icon: 'Target', color: '#059669' },
			{ id: 'i3', title: 'Action Item', description: 'Suggested next step.', icon: 'CheckCircle', color: '#2563eb' },
		],
	}),
	(baseId) => ({
		id: baseId,
		title: 'Follow-up Suggestions',
		weight: 1,
		renderEngine: 'ACTION_GROUP',
		items: [
			{ id: 'a1', title: 'Dive Deeper', description: 'Explore related notes on this topic.', icon: 'MessageCircle', color: '#dc2626' },
			{ id: 'a2', title: 'Open in Chat', description: 'Continue the conversation.', icon: 'Search', color: '#ea580c' },
			{ id: 'a3', title: 'Save to Note', description: 'Export insights to a new note.', icon: 'FileText', color: '#0891b2' },
		],
	}),
	(baseId, i) => ({
		id: baseId,
		title: 'Analysis Notes',
		weight: 5,
		renderEngine: 'MARKDOWN',
		markdown: MARKDOWN_VARIANTS[i % MARKDOWN_VARIANTS.length],
	}),
	(baseId) => ({
		id: baseId,
		title: 'Data Summary',
		weight: 5,
		renderEngine: 'MARKDOWN',
		markdown: '| Topic | Relevance | Notes |\n|-------|-----------|-------|\n| Architecture | High | Core pattern identified |\n| Testing | Medium | Needs follow-up |\n| Documentation | Low | Optional |',
	}),
	(baseId, i) => ({
		id: baseId,
		title: 'Process Flow',
		weight: 4,
		renderEngine: 'MERMAID',
		mermaidCode: MERMAID_VARIANTS[i % MERMAID_VARIANTS.length],
	}),
	(baseId) => ({
		id: baseId,
		title: 'Comparison',
		weight: 3,
		renderEngine: 'TILE',
		items: [
			{ id: 'c1', title: 'Option A', description: 'Pros: fast. Cons: limited.', icon: 'Zap', color: '#16a34a' },
			{ id: 'c2', title: 'Option B', description: 'Pros: flexible. Cons: complex.', icon: 'Settings', color: '#ca8a04' },
		],
	}),
	(baseId, i) => ({
		id: baseId,
		title: 'Concept Map',
		weight: 3,
		renderEngine: 'MERMAID',
		mermaidCode: MERMAID_VARIANTS[(i + 1) % MERMAID_VARIANTS.length],
	}),
	(baseId) => ({
		id: baseId,
		title: 'Quick Actions',
		weight: 1,
		renderEngine: 'ACTION_GROUP',
		items: [
			{ id: 'q1', title: 'Create Note', description: 'Start a new note from this topic.', icon: 'FilePlus', color: '#7c3aed' },
			{ id: 'q2', title: 'Search Vault', description: 'Find more related content.', icon: 'Search', color: '#059669' },
		],
	}),
	(baseId, i) => ({
		id: baseId,
		title: 'Findings',
		weight: 2,
		renderEngine: 'MARKDOWN',
		markdown: MARKDOWN_VARIANTS[(i + 2) % MARKDOWN_VARIANTS.length],
	}),
	(baseId) => ({
		id: baseId,
		title: 'Recommendations',
		weight: 2,
		renderEngine: 'TILE',
		items: [
			{ id: 'r1', title: 'High Priority', description: 'Address this first.', icon: 'AlertCircle', color: '#dc2626' },
			{ id: 'r2', title: 'Medium', description: 'Schedule for next sprint.', icon: 'Clock', color: '#ca8a04' },
			{ id: 'r3', title: 'Low', description: 'Nice to have.', icon: 'Info', color: '#6b7280' },
		],
	}),
	(baseId) => ({
		id: baseId,
		title: 'Relevance Distribution',
		weight: 3,
		renderEngine: 'MERMAID',
		mermaidCode: MERMAID_VARIANTS[5],
	}),
	(baseId) => ({
		id: baseId,
		title: 'Scores Chart',
		weight: 4,
		renderEngine: 'MERMAID',
		mermaidCode: MERMAID_VARIANTS[6],
	}),
	(baseId) => ({
		id: baseId,
		title: 'Insight Summary',
		weight: 5,
		renderEngine: 'MARKDOWN',
		markdown: MARKDOWN_VARIANTS[6],
	}),
	// 13: Long content (>800 chars) → contentHint "long" → wider block
	(baseId) => ({
		id: baseId,
		title: 'Long Analysis (content-aware wider)',
		weight: 5,
		renderEngine: 'MARKDOWN',
		markdown: `## Thought evolution analysis hypothesis

1. **Original drive**: The primary mechanism suggests a modular architecture with clear boundaries between services. Cross-referencing with related notes reveals consistent themes around testing and documentation.

2. **Interest-driven**: The evidence points toward an incremental migration strategy. The team should first identify high-impact modules, then refactor in small batches. Documentation should be updated in parallel to avoid drift.

3. **Synthesis**: This analysis uncovered several important patterns. Recommended approach: verify assumptions with stakeholders, run integration tests in staging, and document decisions in ADRs. Proceed with caution in production environments. Key insight: the evidence points toward an incremental migration strategy; document decisions in ADRs.

This analysis uncovered several important patterns. Recommended approach: verify assumptions with stakeholders, run integration tests in staging, and document decisions in ADRs. Proceed with caution in production environments. Key insight: the evidence points toward an incremental migration strategy; document decisions in ADRs.

The team should first identify high-impact modules, then refactor in small batches. Documentation should be updated in parallel to avoid drift.

Proceed with caution in production environments. Key insight: the evidence points toward an incremental migration strategy; document decisions in ADRs.

Key insight: the evidence points toward an incremental migration strategy; document decisions in ADRs.

## Overview

The evidence points toward an incremental migration strategy; document decisions in ADRs.

- The team should first identify high-impact modules, then refactor in small batches.
- Documentation should be updated in parallel to avoid drift.
- Proceed with caution in production environments.
- Key insight: the evidence points toward an incremental migration strategy; document decisions in ADRs.

- The team should first identify high-impact modules, then refactor in small batches.
- Documentation should be updated in parallel to avoid drift.
- Proceed with caution in production environments.
- Key insight: the evidence points toward an incremental migration strategy; document decisions in ADRs.

- The team should first identify high-impact modules, then refactor in small batches.
- Documentation should be updated in parallel to avoid drift.
- Proceed with caution in production environments.
- Key insight: the evidence points toward an incremental migration strategy; document decisions in ADRs.

`,
	}),
	// 14: No markdown, no items → contentHint "short" → narrower block
	(baseId) => ({
		id: baseId,
		title: 'Related Questions',
		weight: 1,
		renderEngine: 'MARKDOWN',
		markdown: '',
		items: [],
	}),
];

/** Fixed sequence: includes long (13) and short (14) demo blocks for content-aware width. */
const CURATED_BLOCK_ORDER = [4, 10, 3, 13, 0, 14];
// 4=Process Flow (MERMAID flowchart/sequence), 10=Relevance Pie (MERMAID pie),
// 3=Data Summary (MARKDOWN table), 0=Key Insights (TILE), 11=Scores Chart (MERMAID xyChart),
// 2=Analysis Notes (MARKDOWN)

function buildDashboardBlocks(i: number): DashboardBlock[] {
	const count = 6;
	const blocks: DashboardBlock[] = [];
	for (let k = 0; k < count; k++) {
		const idx = CURATED_BLOCK_ORDER[k % CURATED_BLOCK_ORDER.length];
		const fn = BLOCK_TEMPLATES[idx];
		blocks.push(fn(`block-${i}-${k}`, i));
	}
	return blocks;
}

function buildTopicInspectResults(topics: AISearchTopic[], sources: AISearchSource[], i: number): Record<string, SearchResultItem[]> {
	const result: Record<string, SearchResultItem[]> = {};
	topics.forEach((t, ti) => {
		if (sources.length === 0) return;
		// (i+ti)%3=1: no expansion at all (pure pill). (i+ti)%3=0: no inspect (partial).
		if ((i + ti) % 3 === 0 || (i + ti) % 3 === 1) return;
		const pickCount = 1 + ((i + ti) % Math.max(1, sources.length));
		result[t.label] = sources.slice(0, pickCount).map((s, si) => ({
			id: `${s.id}-inspect`,
			type: 'markdown' as const,
			title: s.title,
			path: s.path,
			lastModified: Date.now() - (i + si) * 1000,
			source: 'local' as const,
			score: s.score.average,
		}));
	});
	return result;
}

function buildTopicAnalyzeResults(topics: AISearchTopic[], _query: string, i: number): Record<string, { question: string; answer: string }[]> {
	const qaTemplates = [
		{ q: 'What is the main idea?', a: 'The analysis suggests a modular approach with clear boundaries.' },
		{ q: 'How does this connect to the query?', a: 'It directly addresses the core question about structure and flow.' },
		{ q: 'What are the implications?', a: 'This enables better maintainability and extensibility.' },
		{ q: 'Any caveats?', a: 'Consider edge cases when scaling to larger systems.' },
		{ q: 'What are the key takeaways?', a: 'Focus on separation of concerns and incremental adoption.' },
		{ q: 'How to apply this?', a: 'Start with a small pilot, then expand based on learnings.' },
	];
	const result: Record<string, { question: string; answer: string }[]> = {};
	topics.forEach((t, ti) => {
		// ~1/3 topics: no analyze (pure tag pill, no expansion)
		if ((i + ti) % 3 === 1) return;
		const count = 1 + ((i + ti) % 3);
		result[t.label] = Array.from({ length: count }, (_, qi) => {
			const tmpl = qaTemplates[(i + ti + qi) % qaTemplates.length];
			return { question: `${tmpl.q} (${t.label})`, answer: tmpl.a };
		});
	});
	return result;
}

function buildTopicGraphResults(topics: AISearchTopic[], i: number): Record<string, GraphPreview | null> {
	const result: Record<string, GraphPreview | null> = {};
	topics.forEach((t, ti) => {
		// (i+ti)%3=1: no expansion (pure pill - skip entirely). (i+ti)%3=2: no graph (partial).
		if ((i + ti) % 3 === 1) return;
		if ((i + ti) % 3 === 2) {
			result[t.label] = null;
			return;
		}
		const nodeCount = 2 + ((i + ti) % 4);
		const nodes: GraphPreview['nodes'] = Array.from({ length: nodeCount }, (_, ni) => ({
			id: `tg-${i}-${ti}-${ni}`,
			label: ni === 0 ? t.label : `Sub-${String.fromCharCode(65 + ni)}`,
			type: 'document' as const,
		}));
		const edges: GraphPreview['edges'] = [];
		for (let ei = 0; ei < nodeCount - 1; ei++) {
			edges.push({ from_node_id: nodes[ei].id, to_node_id: nodes[ei + 1].id, weight: 1 });
		}
		if (nodeCount > 1 && (i + ti) % 2 === 0) {
			edges.push({ from_node_id: nodes[0].id, to_node_id: nodes[nodes.length - 1].id, weight: 1 });
		}
		result[t.label] = { nodes, edges };
	});
	return result;
}

const MOCK_AI_ANALYSIS_RECORDS_INIT: MockAIAnalysisRecord[] = Array.from({ length: 100 }, (_, i) => {
	const idx = i % sampleQueries.length;
	const query = sampleQueries[idx];
	const vault_rel_path = samplePaths[idx] + i;

	// Random counts
	const sources_count = makeRandomInt(1, 3);
	const topics_count = makeRandomInt(2, 4);
	const graph_nodes_count = makeRandomInt(2, 5);
	const graph_edges_count = makeRandomInt(1, 3);

	const sourceTitles = ['Overview', 'Deep Dive', 'Reference', 'Examples', 'Tutorial', 'API Docs', 'Case Study'];
	const sourcePaths = ['docs/', 'notes/', 'guides/', 'examples/', 'src/'];
	const badgesPool = [['primary'], ['reference'], ['core', 'design'], ['supporting'], []];
	const sources: AISearchSource[] = Array.from({ length: sources_count }, (_, sidx) => ({
		id: `src-${i + 1}-${sidx + 1}`,
		title: sourceTitles[(idx + sidx) % sourceTitles.length],
		path: `${sourcePaths[(idx + sidx) % sourcePaths.length]}Mock${i + 1}-${sidx + 1}.md`,
		reasoning: sidx === 0 ? 'Primary source for this analysis.' : 'Supporting evidence and related context.',
		badges: badgesPool[(i + sidx) % badgesPool.length],
		score: {
			physical: makeRandomInt(70, 95),
			semantic: makeRandomInt(70, 95),
			average: makeRandomInt(70, 95)
		}
	}));

	const topicLabels = [
		'Architecture', 'Design Patterns', 'Implementation', 'Testing', 'Documentation',
		'Performance', 'Security', 'Scalability', 'Best Practices', 'Common Pitfalls',
		'Quick Start', 'Advanced Usage', 'Troubleshooting', 'Related Concepts',
	];
	const topics: AISearchTopic[] = Array.from({ length: topics_count }, (_, tidx) => ({
		label: topicLabels[(idx + tidx) % topicLabels.length],
		weight: Number((Math.random() * 0.5 + 0.5).toFixed(2))
	}));

	// Create random graph
	const nodes: AISearchGraph['nodes'] = [
		...sources.map((src, nidx) => ({
			id: `file:${src.path}`,
			type: 'document',
			title: src.title,
			path: src.path,
			attributes: {}
		})),
		...topics.map((tp, nidx) => ({
			id: `concept:${tp.label.toLowerCase().replace(' ', '-')}`,
			type: 'concept',
			title: tp.label,
			attributes: {}
		}))
	].slice(0, graph_nodes_count);

	const nodeIds = nodes.map(n => n.id);
	const edges: AISearchGraph['edges'] = Array.from({ length: graph_edges_count }, (_, eidx) => ({
		id: `e${i + 1}-${eidx + 1}`,
		source: getRandomElement(nodeIds),
		target: getRandomElement(nodeIds),
		type: 'link',
		attributes: { weight: makeRandomInt(1, 3) }
	})).filter(e => e.source !== e.target);

	const graph: AISearchGraph = { nodes, edges };

	const nowTs = Date.now() - i * makeRandomInt(3600_000, 86400_000);
	const duration = makeRandomInt(3000, 8000);

	const summaryParagraphs = [
		`## Mock Analysis: ${query}\n\nThis analysis explores key themes and connections.`,
		`## Key Findings\n\nSeveral important patterns emerged from the analysis of "${query}".`,
		`## Overview\n\nThe search uncovered **${sources_count} relevant sources** and **${topics_count} main topics**. Below is a synthesized view.`,
	];
	const summary = summaryParagraphs[i % summaryParagraphs.length];

	const mockTitle = query ? `Mock: ${query.slice(0, 45)}${query.length > 45 ? '…' : ''}` : 'Mock AI Analysis';
	const mermaidVariant = MERMAID_VARIANTS[i % MERMAID_VARIANTS.length];

	const snapshot: CompletedAnalysisSnapshot = {
		version: 1,
		title: mockTitle,
		summaries: summary ? [summary] : [],
		summaryVersion: 1,
		analysisStartedAtMs: nowTs - duration,
		duration,
		usage: { inputTokens: 80, outputTokens: makeRandomInt(150, 300), totalTokens: makeRandomInt(230, 380) },
		topics,
		dashboardBlocks: buildDashboardBlocks(i),
		sources,
		graph,
		overviewMermaidVersions: [mermaidVariant],
		overviewMermaidActiveIndex: 0,
		topicInspectResults: buildTopicInspectResults(topics, sources, i),
		topicAnalyzeResults: buildTopicAnalyzeResults(topics, query, i),
		topicGraphResults: buildTopicGraphResults(topics, i),
	};

	const docModel = fromCompletedAnalysisSnapshot(snapshot, query, false);
	docModel.created = new Date(nowTs).toISOString();
	const markdown = buildMarkdown(docModel, { runAnalysisMode: 'vaultFull', includeSteps: false });

	return {
		id: `mock-ai-${i + 1}`,
		vault_rel_path,
		query,
		title: mockTitle,
		created_at_ts: nowTs,
		web_enabled: 0,
		estimated_tokens: snapshot.usage?.totalTokens ?? makeRandomInt(150, 350),
		sources_count,
		topics_count,
		graph_nodes_count: nodes.length,
		graph_edges_count: edges.length,
		duration,
		_markdownForReplay: markdown,
	} as MockAIAnalysisRecord & { _markdownForReplay: string };
});

export class MockAIAnalysisHistoryService {
	private records: (AIAnalysisHistoryRecord & { _markdownForReplay?: string })[] = [...MOCK_AI_ANALYSIS_RECORDS_INIT];
	private byPath = new Map<string, (AIAnalysisHistoryRecord & { _markdownForReplay?: string })>();

	constructor() {
		for (const r of this.records) this.byPath.set(r.vault_rel_path, r);
	}

	/** Mock-only: return pre-built markdown for replay when file does not exist in vault. */
	async getMarkdownForReplay(path: string): Promise<string | null> {
		const r = this.byPath.get(path);
		return (r as any)?._markdownForReplay ?? null;
	}

	async list(params: any) {
		const limit = Math.max(1, Math.min(200, params.limit || 20));
		const offset = Math.max(0, params.offset || 0);
		const sorted = [...this.records].sort((a, b) => b.created_at_ts - a.created_at_ts);
		return sorted.slice(offset, offset + limit);
	}
	async count() {
		return this.records.length;
	}
	async insertOrIgnore(record: any) {
		const byPath = new Map<string, AIAnalysisHistoryRecord>();
		for (const r of this.records) byPath.set(r.vault_rel_path, r);
		const path = String(record.vault_rel_path ?? '').trim();
		if (!path || byPath.has(path)) return;
		byPath.set(path, record);
		this.records.push(record);
	}
	async deleteAll() {
		this.records.length = 0;
		this.byPath.clear();
	}
}
