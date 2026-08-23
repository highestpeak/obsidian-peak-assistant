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
import type { CopilotActionAgentPort } from '@/core/ports/CopilotActionPorts';
import type { GrepHit } from '@/service/agents/vault/vaultToolImplementations';
import { z } from 'zod';
import { ok, type ToolDef } from '@/core/types/tool';
import type { CopilotOutputCollector } from '../CopilotOutputCollector';
import { buildCopilotOutputTools, COPILOT_OUTPUT_TOOL_NAMES } from '../CopilotOutputTools';
import {
	assertSuccessfulRun,
	streamHarnessModel,
	usageFromHarnessResult,
} from '@/service/agents/harness/HarnessModelRunner';
import { buildVaultHarnessTools } from '@/service/agents/vault/vaultHarnessTools';
import type { PluginCommandGatewayPort } from '@/core/ports/PluginCommandGatewayPort';
import { loadApprovedPluginCommandTools } from '@/service/command-gateway/pluginCommandToolCatalog';
import type { DebugTracePort } from '@/core/debug-trace';

/** Vault-grep callback shape the agent loop needs. */
export type CopilotAgentSearchFn = (q: string, limit: number) => Promise<GrepHit[]>;

/** Deps the app composition layer hands to the agent port factory. */
export interface CopilotAgentPortDeps {
	app: AppHandle;
	pluginId: string;
	/** Return the active Harness model binding, or null if none is configured. */
	resolveActiveBinding(): { profile: Profile; modelId: string } | null;
	/** Vault-grep search callback (typically wraps SearchClient). */
	search: CopilotAgentSearchFn;
	/** T11L: narrow port the embedded `get_recent_analysis` tool needs. */
	analysisHistory: AnalysisHistoryPort;
	/** Resolve lazily because app boot composes this catalog before the gateway. */
	resolvePluginCommandGateway(): PluginCommandGatewayPort | null;
	debugTrace?: DebugTracePort | null;
}

/**
 * Build the Harness-owned `submit_result` tool for structured actions.
 */
function buildSubmitResultTool(onSubmit: (result: string) => void): ToolDef {
	return {
		name: 'mcp__copilot__submit_result',
		description: 'Call this tool when you have completed your analysis and are ready to submit the final result. Pass the result as a JSON string matching the required output schema.',
		inputSchema: z.object({
			result: z.string().describe('JSON string of the structured result'),
		}),
		source: 'local',
		kind: 'meta',
		async execute(input) {
			onSubmit(input.result);
			return ok({ acknowledged: true });
		},
	};
}

/**
 * Build a {@link CopilotActionAgentPort} bound to concrete deps. The
 * returned `runAgentStream` is the only entry point service-side actions
 * use; the closure carries the Obsidian app + profile lookup, so the
 * agent body itself never reaches a singleton.
 */
export function createCopilotAgentPort(deps: CopilotAgentPortDeps): CopilotActionAgentPort {
	const { app, pluginId, resolveActiveBinding, search, analysisHistory } = deps;

	return {
		async *runAgentStream(options): AsyncGenerator<LLMStreamEvent, ActionResult | void> {
			const triggerName = StreamTriggerName.COPILOT;

			const binding = resolveActiveBinding();
			if (!binding) {
				yield {
					type: 'error',
					error: new Error('No active agent profile configured. Please set up a profile in Settings.'),
					triggerName,
				} as LLMStreamEvent;
				return;
			}

			const searchFn: CopilotAgentSearchFn = search;

			const vaultTools = buildVaultHarnessTools({
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
			const copilotTools = collector
				? buildCopilotOutputTools({ collector })
				: [buildSubmitResultTool((result) => {
					capturedResult = result;
				})];
			const pluginCommandTools = await loadApprovedPluginCommandTools(
				deps.resolvePluginCommandGateway(),
			);

			const submissionsBefore = collector?.getSnapshot().submissions.length ?? 0;
			let usage: ActionUsage | undefined;

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
					...pluginCommandTools.map((tool) => tool.name),
				];

				const allowedToolNames = new Set(allowedTools);
				const tools = [...vaultTools, ...copilotTools, ...pluginCommandTools]
					.filter((tool) => allowedToolNames.has(tool.name));
				const stream = streamHarnessModel({
					loopId: `copilot-action-${pluginId}-${Date.now()}`,
					profile: binding.profile,
					modelId: options.modelId ?? binding.modelId,
					prompt: options.userPrompt,
					systemPrompt: options.systemPrompt,
					tools,
					maxSteps: options.maxTurns ?? 20,
					maxToolCalls: Math.max(12, (options.maxTurns ?? 20) * 4),
					signal: options.signal,
					triggerName,
					debugTrace: deps.debugTrace,
					debugSurface: 'analyze',
					debugCapabilityId: 'copilot.action-agent',
					stopWhen: () =>
						capturedResult !== null
						|| Boolean(
							collector
							&& collector.getSnapshot().submissions.length > submissionsBefore,
						),
					treatBareTextAsFinal: false,
					bareTextContinuationNudge: collector
						? 'Continue using the available tools. Finish by calling mcp__copilot__submit_review.'
						: 'Continue using the available tools. Finish by calling mcp__copilot__submit_result.',
				});

				while (true) {
					const next = await stream.next();
					if (next.done) {
						assertSuccessfulRun(next.value);
						const runUsage = usageFromHarnessResult(next.value);
						usage = {
							inputTokens: runUsage.inputTokens ?? 0,
							outputTokens: runUsage.outputTokens ?? 0,
						};
						break;
					}
					yield next.value;
				}
			} catch (err) {
				yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
				return;
			}

			if (capturedResult) {
				try {
					const parsed = JSON.parse(capturedResult);
					return { type: 'structured', data: parsed, usage } as ActionResult;
				} catch {
					return { type: 'error', message: 'Failed to parse agent result as JSON' } as ActionResult;
				}
			}
		},
	};
}
