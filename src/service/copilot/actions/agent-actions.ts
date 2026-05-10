/**
 * Shared infrastructure for copilot actions that run as agent loops.
 * Wraps queryWithProfile + vault MCP server and yields LLMStreamEvents.
 */

import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import type { ActionResult, ActionUsage } from '../CopilotActionRegistry';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { warmupPool, queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { buildVaultMcpServer, type GrepHit } from '@/service/agents/vault-sdk/vaultMcpServer';
import { translateSdkMessage } from '@/service/agents/core/sdkMessageAdapter';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export interface CopilotAgentOptions {
	/** System prompt for the agent */
	systemPrompt: string;
	/** User prompt (includes document context) */
	userPrompt: string;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

/**
 * Build a lightweight MCP server with a single `submit_result` tool.
 * The agent calls this tool to submit its structured output.
 */
function buildSubmitResultMcpServer(onSubmit: (result: string) => void) {
	const submitResult = tool(
		'submit_result',
		'Call this tool when you have completed your analysis and are ready to submit the final result. Pass the result as a JSON string matching the required output schema.',
		{ result: z.string().describe('JSON string of the structured result') },
		async (input) => {
			onSubmit(input.result);
			return { content: [{ type: 'text' as const, text: '{"acknowledged": true}' }] };
		},
	);
	return createSdkMcpServer({ tools: [submitResult] });
}

/**
 * Run a copilot agent loop. Yields LLMStreamEvents for real-time step display.
 * The generator returns the captured ActionResult when the agent calls submit_result.
 */
export async function* buildCopilotAgentStream(
	options: CopilotAgentOptions,
): AsyncGenerator<LLMStreamEvent, ActionResult | void> {
	const triggerName = StreamTriggerName.COPILOT;
	const appContext = AppContext.getInstance();
	const { app } = appContext;
	const pluginId = appContext.plugin.manifest.id;

	// 1. Warm up SDK pool
	try {
		await warmupPool();
	} catch (err) {
		yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
		return;
	}

	// 2. Resolve agent profile
	const profile: Profile | null = ProfileRegistry.getInstance().getActiveAgentProfile();
	if (!profile) {
		yield {
			type: 'error',
			error: new Error('No active agent profile configured. Please set up a profile in Settings.'),
			triggerName,
		} as LLMStreamEvent;
		return;
	}

	// 3. Build vault MCP server (reuse existing)
	const searchClient = appContext.searchClient;
	const searchFn = async (q: string, limit: number): Promise<GrepHit[]> => {
		const res = await searchClient.search({
			text: q,
			topK: limit,
			searchMode: 'hybrid',
			scopeMode: 'vault',
			indexTenant: 'vault',
		} as any);
		return (res.items ?? []).map((i: any) => ({
			path: i.path,
			snippet: i.title ?? i.path,
			score: i.score ?? 0,
		}));
	};

	// submit_plan is required by buildVaultMcpServer but unused in copilot — auto-acknowledge
	const vaultMcpServer = buildVaultMcpServer({
		app,
		searchFn,
		onSubmitPlan: async (plan) => ({
			approved: true,
			adjustedPaths: plan.selected_paths,
			adjustedOutline: plan.proposed_outline,
		}),
	});

	// 4. Build submit_result MCP server
	let capturedResult: string | null = null;
	const submitMcpServer = buildSubmitResultMcpServer((result) => {
		capturedResult = result;
	});

	// 5. Run agent
	let sdkUsage: { inputTokens: number; outputTokens: number } | null = null;
	const startTs = Date.now();

	try {
		const allowedTools = [
			'mcp__vault__vault_list_folders',
			'mcp__vault__vault_read_folder',
			'mcp__vault__vault_read_note',
			'mcp__vault__vault_grep',
			'mcp__vault__vault_wikilink_expand',
			'mcp__copilot__submit_result',
		];

		const messages = queryWithProfile(app, pluginId, profile, {
			prompt: options.userPrompt,
			systemPrompt: options.systemPrompt,
			maxTurns: 20,
			allowedTools,
			disallowedTools: ['AskUserQuestion', 'mcp__vault__vault_submit_plan'],
			mcpServers: {
				vault: vaultMcpServer,
				copilot: submitMcpServer,
			},
			signal: options.signal,
		});

		for await (const raw of messages) {
			const events = translateSdkMessage(raw, {
				triggerName,
				hasPartialMessages: true,
			});
			for (const ev of events) {
				yield ev;
			}

			// If we got the result message, capture usage and break
			const msg = raw as any;
			if (msg.type === 'result' && msg.usage) {
				sdkUsage = {
					inputTokens: msg.usage.input_tokens ?? 0,
					outputTokens: msg.usage.output_tokens ?? 0,
				};
			}
		}
	} catch (err) {
		const errMsg = (err as Error)?.message ?? '';
		if (errMsg.toLowerCase().includes('maximum number of turns')) {
			console.warn('[CopilotAgent] max turns reached');
		} else {
			yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
			return;
		}
	}

	// 6. Emit complete
	yield {
		type: 'complete',
		triggerName,
		durationMs: Date.now() - startTs,
		usage: sdkUsage ?? undefined,
	} as LLMStreamEvent;

	// 7. Return captured result
	if (capturedResult) {
		try {
			const parsed = JSON.parse(capturedResult);
			const usage: ActionUsage | undefined = sdkUsage
				? { inputTokens: sdkUsage.inputTokens, outputTokens: sdkUsage.outputTokens }
				: undefined;
			return { type: 'structured', data: parsed, usage } as ActionResult;
		} catch {
			return { type: 'error', message: 'Failed to parse agent result as JSON' } as ActionResult;
		}
	}
}
