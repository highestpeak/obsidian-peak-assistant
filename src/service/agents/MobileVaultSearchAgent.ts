import type { App } from 'obsidian';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { MobileSearchService } from '@/service/search/MobileSearchService';
import {
	type LLMStreamEvent,
	type LLMUsage,
	StreamTriggerName,
	UIStepType,
	emptyUsage,
	mergeTokenUsage,
} from '@/core/providers/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { PromptId } from '@/service/prompt/PromptId';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rough char→token ratio for budget estimation. */
const CHARS_PER_TOKEN = 4;

/** Max tokens worth of file content to pack into the prompt. */
const TOKEN_BUDGET = 800_000;

const SYSTEM_PROMPT =
	'You are an AI assistant analyzing a personal knowledge vault. ' +
	'Below are the relevant files from the user\'s vault. ' +
	'Answer the user\'s question based on these files. ' +
	'Be specific, cite file names, and provide actionable insights.';

// ---------------------------------------------------------------------------
// MobileVaultSearchAgent
// ---------------------------------------------------------------------------

/**
 * Simplified vault search agent for mobile:
 *   search files → read content → stream Claude long-context response.
 *
 * No multi-agent recon, no HITL plan review, no SQLite.
 */
export class MobileVaultSearchAgent {
	private readonly searchService: MobileSearchService;
	private readonly aiServiceManager: AIServiceManager;
	private cancelled = false;

	constructor(app: App, aiServiceManager: AIServiceManager) {
		this.searchService = new MobileSearchService(app);
		this.aiServiceManager = aiServiceManager;
	}

	cancel(): void {
		this.cancelled = true;
	}

	async *startSession(userQuery: string): AsyncGenerator<LLMStreamEvent> {
		const sessionId = generateUuidWithoutHyphens();
		const startedAt = Date.now();
		let totalUsage: LLMUsage = emptyUsage();

		// ── 1. Search ────────────────────────────────────────────────
		const searchStepId = `${sessionId}-search`;
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId: searchStepId,
			title: 'Searching vault files...',
			triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT,
		};

		await this.searchService.loadIntuitionMap();
		const results = await this.searchService.search(userQuery);

		if (this.cancelled) return;

		yield {
			type: 'ui-step-delta',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId: searchStepId,
			titleDelta: ` Found ${results.length} files.`,
			triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT,
		};

		if (results.length === 0) {
			yield {
				type: 'text-delta',
				delta: 'No relevant files found for your query.',
				triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT,
			};
			yield {
				type: 'complete',
				finishReason: 'stop' as const,
				usage: totalUsage,
				durationMs: Date.now() - startedAt,
				triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT,
			};
			return;
		}

		// ── 2. Read file contents ────────────────────────────────────
		const readStepId = `${sessionId}-read`;
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId: readStepId,
			title: 'Reading file contents...',
			triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT,
		};

		const fileContexts: string[] = [];
		let tokenCount = 0;
		let filesRead = 0;

		for (const result of results) {
			if (this.cancelled) return;
			if (tokenCount >= TOKEN_BUDGET) break;

			try {
				const content = await this.searchService.readFileContent(result.path);
				const contentTokens = Math.ceil(content.length / CHARS_PER_TOKEN);

				if (tokenCount + contentTokens > TOKEN_BUDGET) {
					// Truncate to fit budget
					const remainingChars = (TOKEN_BUDGET - tokenCount) * CHARS_PER_TOKEN;
					if (remainingChars > 200) {
						fileContexts.push(
							`## File: ${result.path}\n\n${content.slice(0, remainingChars)}\n\n[... truncated ...]`,
						);
						tokenCount = TOKEN_BUDGET;
						filesRead++;
					}
					break;
				}

				fileContexts.push(`## File: ${result.path}\n\n${content}`);
				tokenCount += contentTokens;
				filesRead++;
			} catch {
				// Skip unreadable files
			}
		}

		yield {
			type: 'ui-step-delta',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId: readStepId,
			titleDelta: ` Read ${filesRead} files (~${Math.round(tokenCount / 1000)}K tokens).`,
			triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT,
		};

		if (this.cancelled) return;

		// ── 3. Build prompt & stream response ────────────────────────
		const reportStepId = `${sessionId}-report`;
		yield {
			type: 'ui-step',
			uiType: UIStepType.STEPS_DISPLAY,
			stepId: reportStepId,
			title: 'Generating response...',
			triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT,
		};

		const fileBlock = fileContexts.join('\n\n---\n\n');

		// Include intuition map context if available
		const intuitionMap = (this.searchService as any)['intuitionMap'];
		const intuitionBlock = intuitionMap
			? `\n\n## Vault Intuition Context\n\n${JSON.stringify(intuitionMap, null, 2)}`
			: '';

		const userContent = `${fileBlock}${intuitionBlock}\n\n---\n\nUser question: ${userQuery}`;

		const { provider, modelId } = this.aiServiceManager.getModelForPrompt(
			PromptId.AiAnalysisSummary,
		);

		const stream = this.aiServiceManager.getMultiChat().streamChat({
			provider,
			model: modelId,
			system: SYSTEM_PROMPT,
			messages: [
				{
					role: 'user',
					content: [{ type: 'text', text: userContent }],
				},
			],
		});

		const answerParts: string[] = [];

		for await (const event of stream) {
			if (this.cancelled) return;

			if (event.type === 'text-delta') {
				answerParts.push(event.delta);
			}
			if (event.type === 'finish' || event.type === 'complete') {
				totalUsage = mergeTokenUsage(totalUsage, (event as any).usage);
			}

			// Forward the event with our trigger name
			yield { ...event, triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT };
		}

		// ── 4. Complete ──────────────────────────────────────────────
		const finalAnswer = answerParts.join('').trim() || '(No answer generated.)';

		// Generate title via prompt
		let title: string | undefined;
		try {
			const titleStream = this.aiServiceManager.queryStream(
				PromptId.AiAnalysisTitle,
				{ query: userQuery, summary: finalAnswer },
			);
			let titleAcc = '';
			for await (const chunk of titleStream) {
				// Provider v2: Agent SDK emits text-delta + complete
				if (chunk.type === 'text-delta' && typeof (chunk as any).text === 'string') {
					titleAcc += (chunk as any).text;
				} else if (chunk.type === 'complete') {
					if (titleAcc) title = titleAcc.trim() || undefined;
					const ev = chunk as { usage?: any };
					if (ev.usage) totalUsage = mergeTokenUsage(totalUsage, ev.usage);
				}
				// Legacy PromptService events (fallback compat)
				if (chunk.type === 'prompt-stream-result') {
					title = String((chunk as any).output ?? '').trim() || undefined;
					totalUsage = mergeTokenUsage(totalUsage, (chunk as any).usage);
				}
				yield { ...chunk, triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT };
			}
		} catch {
			// Title generation is best-effort
		}
		if (!title) title = userQuery.trim().slice(0, 80);

		yield {
			type: 'complete',
			finishReason: 'stop' as const,
			usage: totalUsage,
			durationMs: Date.now() - startedAt,
			result: {
				title,
				summary: finalAnswer,
				topics: [],
				sources: results.map((r) => r.path),
				graph: { nodes: [], edges: [] },
				dashboardBlocks: [],
				suggestedFollowUpQuestions: [],
			},
			triggerName: StreamTriggerName.MOBILE_VAULT_SEARCH_AGENT,
		};
	}
}
