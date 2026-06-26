/**
 * T11B (2026-06-14): Copilot agent stream factory.
 *
 * Before T11B this module reached `AppContext.getInstance()` and
 * `ProfileRegistry.getInstance()` from inside service code. The agent
 * loop now takes a small deps bag — Obsidian `App`, plugin id, profile
 * resolver, search function — and the app composition layer (under
 * `src/app/copilot/actions/`) is the only place that wires those.
 *
 * The exported {@link createCopilotAgentPort} returns a
 * {@link CopilotActionAgentPort.runAgentStream} implementation that the
 * runtime hands to action closures.
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { AnalysisHistoryPort } from '@/core/ports/AnalysisHistoryPort';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import type { ActionResult, ActionUsage } from '../CopilotActionRegistry';
import type { CopilotActionAgentPort } from './CopilotActionPorts';
import { warmupPool, queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { buildVaultMcpServer, type GrepHit } from '@/service/agents/vault-sdk/vaultMcpServer';
import { translateSdkMessage } from '@/service/agents/core/sdkMessageAdapter';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { CopilotOutputCollector } from '../CopilotOutputCollector';
import { buildCopilotOutputMcpServer, COPILOT_OUTPUT_TOOL_NAMES } from '../CopilotOutputMcpServer';

/** Vault-grep callback shape the agent loop needs. */
export type CopilotAgentSearchFn = (q: string, limit: number) => Promise<GrepHit[]>;

/** Deps the app composition layer hands to the agent port factory. */
export interface CopilotAgentPortDeps {
	app: AppHandle;
	pluginId: string;
	/** Return the active agent profile, or null if the user has none yet. */
	resolveActiveProfile(): Profile | null;
	/** Vault-grep search callback (typically wraps SearchClient). */
	search: CopilotAgentSearchFn;
	/** T11L: narrow port the embedded `get_recent_analysis` tool needs. */
	analysisHistory: AnalysisHistoryPort;
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
	return createSdkMcpServer({ name: 'copilot', version: '1.0.0', tools: [submitResult] });
}

/**
 * Build a {@link CopilotActionAgentPort} bound to concrete deps. The
 * returned `runAgentStream` is the only entry point service-side actions
 * use; the closure carries the Obsidian app + profile lookup, so the
 * agent body itself never reaches a singleton.
 */
export function createCopilotAgentPort(deps: CopilotAgentPortDeps): CopilotActionAgentPort {
	const { app, pluginId, resolveActiveProfile, search, analysisHistory } = deps;

	return {
		async *runAgentStream(options): AsyncGenerator<LLMStreamEvent, ActionResult | void> {
			const triggerName = StreamTriggerName.COPILOT;

			try {
				await warmupPool();
			} catch (err) {
				yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
				return;
			}

			const profile: Profile | null = resolveActiveProfile();
			if (!profile) {
				yield {
					type: 'error',
					error: new Error('No active agent profile configured. Please set up a profile in Settings.'),
					triggerName,
				} as LLMStreamEvent;
				return;
			}

			const searchFn: CopilotAgentSearchFn = search;

			const vaultMcpServer = buildVaultMcpServer({
				app,
				searchFn,
				onSubmitPlan: async (plan) => ({
					approved: true,
					adjustedPaths: plan.selected_paths,
					adjustedOutline: plan.proposed_outline,
				}),
				analysisHistory,
			});

			let capturedResult: string | null = null;
			const collector: CopilotOutputCollector | undefined = options.collector;
			const copilotMcpServer = collector
				? buildCopilotOutputMcpServer({ collector })
				: buildSubmitResultMcpServer((result) => {
					capturedResult = result;
				});

			let sdkUsage: { inputTokens: number; outputTokens: number } | null = null;
			const startTs = Date.now();

			try {
				const allowedTools = [
					'mcp__vault__vault_list_folders',
					'mcp__vault__vault_read_folder',
					'mcp__vault__vault_read_note',
					'mcp__vault__vault_grep',
					'mcp__vault__vault_wikilink_expand',
					...(collector
						? [...COPILOT_OUTPUT_TOOL_NAMES]
						: ['mcp__copilot__submit_result']),
				];

				const messages = queryWithProfile(app, pluginId, profile, {
					prompt: options.userPrompt,
					systemPrompt: options.systemPrompt,
					maxTurns: options.maxTurns ?? 20,
					allowedTools,
					disallowedTools: ['AskUserQuestion', 'mcp__vault__vault_submit_plan'],
					mcpServers: {
						vault: vaultMcpServer,
						copilot: copilotMcpServer,
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

			yield {
				type: 'complete',
				triggerName,
				durationMs: Date.now() - startTs,
				usage: sdkUsage ?? undefined,
			} as LLMStreamEvent;

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
		},
	};
}
