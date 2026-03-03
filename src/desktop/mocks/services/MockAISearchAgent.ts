import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import type {
	SearchAgentResult,
	AISearchGraph,
	AISearchSource,
	AISearchTopic,
} from '@/service/agents/AISearchAgent';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Build fixed mock result for desktop dev / debug */
function buildMockSearchAgentResult(query: string): SearchAgentResult {
	const summary = `## AI Analysis (Mock)\n\nThis is a **mock** result for: "${query}".\n\n- Key points are synthesized from simulated search.\n- Sources and graph below are fixed mock data for UI testing.`;
	const topics: AISearchTopic[] = [
		{ label: 'Mock Topic A', weight: 0.9 },
		{ label: 'Mock Topic B', weight: 0.7 },
		{ label: 'Mock Topic C', weight: 0.5 },
	];
	const sources: AISearchSource[] = [
		{
			id: 'mock-src-1',
			title: 'Mock Note One',
			path: 'Folder/MockNoteOne.md',
			reasoning: 'Relevant to query',
			badges: ['primary'],
			score: { physical: 80, semantic: 85, average: 82 },
		},
		{
			id: 'mock-src-2',
			title: 'Mock Note Two',
			path: 'Folder/MockNoteTwo.md',
			reasoning: 'Supporting source',
			badges: [],
			score: { physical: 70, semantic: 75, average: 72 },
		},
	];
	// Long markdown (>800 chars) → contentHint "long" → wider block
	const longMarkdown = `## Thought evolution analysis hypothesis

1. **Original drive**: The primary mechanism suggests a modular architecture with clear boundaries between services. Cross-referencing with related notes reveals consistent themes around testing and documentation.

2. **Interest-driven**: The evidence points toward an incremental migration strategy. The team should first identify high-impact modules, then refactor in small batches. Documentation should be updated in parallel to avoid drift.

3. **Synthesis**: This analysis uncovered several important patterns. Recommended approach: verify assumptions with stakeholders, run integration tests in staging, and document decisions in ADRs. Proceed with caution in production environments. Key insight: the evidence points toward an incremental migration strategy; document decisions in ADRs.`;

	const dashboardBlocks = [
		{
			id: 'block:mock-1',
			title: 'Insights',
			renderEngine: 'TILE' as const,
			items: [
				{ id: 'item1', title: 'Mock Insight 1', description: 'First mock insight for testing.', icon: 'Lightbulb', color: '#7c3aed' },
				{ id: 'item2', title: 'Mock Insight 2', description: 'Second mock insight.', icon: 'Target', color: '#059669' },
			],
		},
		{
			id: 'block:mock-2',
			title: 'Suggestions',
			renderEngine: 'ACTION_GROUP' as const,
			items: [
				{ id: 's1', title: 'Follow-up A', description: 'Try asking about X', icon: 'MessageCircle', color: '#2563eb' },
				{ id: 's2', title: 'Follow-up B', description: 'Try asking about Y', icon: 'Search', color: '#dc2626' },
			],
		},
		{
			id: 'block:mock-long',
			title: 'Long Analysis (content-aware wider)',
			renderEngine: 'MARKDOWN' as const,
			markdown: longMarkdown,
		},
		{
			id: 'block:mock-short',
			title: 'Related Questions',
			renderEngine: 'MARKDOWN' as const,
			// No markdown, no items → contentHint "short" → narrower block
		},
		// Mock "post-review" block: suggestion-style (review agent may add/fix blocks)
		{
			id: 'block:mock-review',
			title: 'Review Suggestion',
			renderEngine: 'MARKDOWN' as const,
			markdown: 'Mock block added to simulate **review agent** output. In real flow, the review agent suggests fixes for dashboard blocks.',
		},
	];

	const mockTitle = query.trim().length > 0
		? `Mock: ${query.slice(0, 50)}${query.length > 50 ? '…' : ''}`
		: 'Mock AI Analysis';

	const overviewMermaid = `flowchart LR
  subgraph Sources
    A[Mock Note One]
    B[Mock Note Two]
  end
  subgraph Concepts
    C[Mock Concept A]
  end
  C --> A
  A --> B
  B --> C`;

	return {
		title: mockTitle,
		summary,
		topics,
		sources,
		dashboardBlocks,
		overviewMermaid,
	};
}

/** Delay between each stream chunk (text delta, tool call, etc.). */
const DEFAULT_CHUNK_DELAY_MS = 200;
/** Extra delay between major phases (thought -> tool -> update -> summary). */
const DEFAULT_PHASE_DELAY_MS = 1500;
/** Simulated "search agent running" delay before summary (~10–15s total pre-summary). */
const DEFAULT_SIMULATED_SEARCH_MS = 5000;

export type MockAIAnalysisStreamOptions = {
	chunkDelayMs?: number;
	/** Delay between phases (thought, tool calls, summary). Omit to use default. */
	phaseDelayMs?: number;
	/** Simulated delay (ms) for "search in progress" after call_search_agent. Omit to use default. */
	simulatedSearchMs?: number;
	scenario?: 'full' | 'minimal';
};

/**
 * Yields a sequence of LLMStreamEvent for AI Search without calling real LLM/tools.
 * Use in desktop dev to drive steps, summary stream, graph, and final result for debugging.
 */
export async function* mockAIAnalysisStream(
	query: string,
	options?: MockAIAnalysisStreamOptions
): AsyncGenerator<LLMStreamEvent> {
	const chunkDelayMs = options?.chunkDelayMs ?? DEFAULT_CHUNK_DELAY_MS;
	const phaseDelayMs = options?.phaseDelayMs ?? DEFAULT_PHASE_DELAY_MS;
	const simulatedSearchMs = options?.simulatedSearchMs ?? DEFAULT_SIMULATED_SEARCH_MS;
	const scenario = options?.scenario ?? 'full';
	const fullResult = buildMockSearchAgentResult(query);

	// Thought agent talking
	for (const word of ['I will ', 'search for ', `"${query.slice(0, 30)}${query.length > 30 ? '...' : ''}" `, 'and gather ', 'relevant notes.\n']) {
		await delay(chunkDelayMs);
		yield { type: 'text-delta', text: word, triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT };
	}

	// Reasoning delta
	await delay(chunkDelayMs);
	yield { type: 'reasoning-delta', text: 'Planning: call search agent then add_dashboard_blocks.\n', triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT };

	await delay(phaseDelayMs);

	// Tool: call_search_agent
	const callId1 = `mock-call-${Date.now()}-1`;
	await delay(chunkDelayMs);
	yield { type: 'tool-call', id: callId1, toolName: 'call_search_agent', input: { prompt: query }, triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT };
	// Simulate search agent running (real flow can take minutes)
	await delay(simulatedSearchMs);
	await delay(chunkDelayMs);
	yield { type: 'tool-result', id: callId1, toolName: 'call_search_agent', output: { result: { prompt: query } }, triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT };

	await delay(phaseDelayMs);

	if (scenario === 'full') {
		const callId2 = `mock-call-${Date.now()}-2`;
		await delay(chunkDelayMs);
		yield { type: 'tool-call', id: callId2, toolName: 'graph_traversal', input: { start_note_path: 'Folder/MockNoteOne.md', max_steps: 5 }, triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT };
		await delay(chunkDelayMs);
		yield { type: 'tool-result', id: callId2, toolName: 'graph_traversal', output: { result: {  } }, triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT };
		await delay(phaseDelayMs);
	}

	// Result-update tools (thought agent): emit one aggregate tool-result so UI still gets currentResult
	const callId3 = `mock-call-${Date.now()}-3`;
	await delay(chunkDelayMs);
	yield { type: 'tool-call', id: callId3, toolName: 'add_dashboard_blocks', input: { text: 'Add mock dashboard blocks for insights and suggestions.' }, triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT };
	await delay(chunkDelayMs);
	yield { type: 'tool-result', id: callId3, toolName: 'add_dashboard_blocks', output: { result: { updated: true } }, triggerName: StreamTriggerName.SEARCH_DASHBOARD_UPDATE_AGENT, extra: { currentResult: fullResult } };

	await delay(phaseDelayMs);

	// Summary stream (SearchAiSummary)
	await delay(chunkDelayMs);
	yield { type: 'prompt-stream-start', promptId: PromptId.AiAnalysisSummary, triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT };
	const summaryText = fullResult.summary;
	const summaryChunkSize = Math.max(1, Math.floor(summaryText.length / 12));
	for (let i = 0; i < summaryText.length; i += summaryChunkSize) {
		await delay(chunkDelayMs);
		yield { type: 'prompt-stream-delta', promptId: PromptId.AiAnalysisSummary, delta: summaryText.slice(i, i + summaryChunkSize), triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT };
	}
	await delay(chunkDelayMs);
	yield { type: 'prompt-stream-result', promptId: PromptId.AiAnalysisSummary, output: summaryText, triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT };

	await delay(phaseDelayMs);

	// Title stream (AiAnalysisTitle) – typewriter effect in UI
	const titleText = fullResult.title ?? '';
	if (titleText) {
		await delay(chunkDelayMs);
		yield { type: 'prompt-stream-start', promptId: PromptId.AiAnalysisTitle, triggerName: StreamTriggerName.SEARCH_TITLE };
		const titleChunkSize = Math.max(1, Math.floor(titleText.length / 6));
		for (let i = 0; i < titleText.length; i += titleChunkSize) {
			await delay(chunkDelayMs);
			yield { type: 'prompt-stream-delta', promptId: PromptId.AiAnalysisTitle, delta: titleText.slice(i, i + titleChunkSize), triggerName: StreamTriggerName.SEARCH_TITLE };
		}
		await delay(chunkDelayMs);
		yield { type: 'prompt-stream-result', promptId: PromptId.AiAnalysisTitle, output: titleText, triggerName: StreamTriggerName.SEARCH_TITLE };
		await delay(phaseDelayMs);
	}

	// Overview Mermaid stream (AiAnalysisOverviewMermaid)
	const mermaidText = fullResult.overviewMermaid ?? '';
	if (mermaidText) {
		await delay(chunkDelayMs);
		yield { type: 'prompt-stream-start', promptId: PromptId.AiAnalysisOverviewMermaid, triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID };
		const mermaidChunkSize = Math.max(1, Math.floor(mermaidText.length / 8));
		for (let i = 0; i < mermaidText.length; i += mermaidChunkSize) {
			await delay(chunkDelayMs);
			yield { type: 'prompt-stream-delta', promptId: PromptId.AiAnalysisOverviewMermaid, delta: mermaidText.slice(i, i + mermaidChunkSize), triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID };
		}
		await delay(chunkDelayMs);
		yield { type: 'prompt-stream-result', promptId: PromptId.AiAnalysisOverviewMermaid, output: mermaidText, triggerName: StreamTriggerName.SEARCH_OVERVIEW_MERMAID };
		await delay(phaseDelayMs);
	}

	// (Review agent not streamed in mock; fullResult.dashboardBlocks already include a mock "Review Suggestion" block)

	// Final complete
	await delay(chunkDelayMs);
	yield {
		type: 'complete',
		finishReason: 'stop',
		usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
		durationMs: 1500,
		result: fullResult,
		triggerName: StreamTriggerName.SEARCH_SLOT_RECALL_AGENT,
	};
}

/**
 * Mock AISearchAgent for desktop dev: implements the same stream() API
 * so UI uses one code path for both real and mock.
 */
export class MockAISearchAgent {
	async stream(prompt: string, options?: MockAIAnalysisStreamOptions): Promise<AsyncGenerator<LLMStreamEvent>> {
		return mockAIAnalysisStream(prompt, {
			chunkDelayMs: DEFAULT_CHUNK_DELAY_MS,
			phaseDelayMs: DEFAULT_PHASE_DELAY_MS,
			simulatedSearchMs: DEFAULT_SIMULATED_SEARCH_MS,
			scenario: 'full',
			...options,
		});
	}
}
