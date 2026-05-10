/**
 * Execute skills (simple + pipeline) through the agent loop infrastructure.
 *
 * For simple skills: builds a tool set from the whitelist, substitutes input
 * variables into the system prompt, and calls queryWithProfile() once.
 *
 * For pipeline skills: runs each phase sequentially. Each phase gets its own
 * tool set and prompt. The output of the previous phase is passed as context
 * to the next phase.
 */

import type { App } from 'obsidian';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import type { AgentTool } from '@/service/tools/types';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type {
	SkillDefinition,
	SkillExecutionContext,
	SkillExecutionResult,
	SkillPhase,
} from './types';
import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { warmupPool, queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { agentToolsToMcpServer, mcpToolNames, mergeExternalMcpTools } from '@/service/agents/core/agentToolMcpAdapter';
import { translateSdkMessages } from '@/service/agents/core/sdkMessageAdapter';

import { contentReaderTool } from '@/service/tools/content-reader';
import { submitFinalAnswerTool } from '@/service/tools/submit-final-answer';
import {
	inspectNoteContextTool,
	graphTraversalTool,
	findPathTool,
	findKeyNodesTool,
	findOrphansTool,
	searchByDimensionsTool,
	exploreFolderTool,
	recentChangesWholeVaultTool,
	localSearchWholeVaultTool,
} from '@/service/tools/search-graph-inspector';
import { getAllMcpAgentTools } from '@/service/mcp/MCPToolAdapter';

const MCP_SERVER_NAME = 'skill';

/**
 * Map of tool name strings (as used in skill YAML) to builder functions.
 * Each builder returns an AgentTool instance.
 */
function getToolBuilders(tm?: TemplateManager): Record<string, () => AgentTool> {
	return {
		content_reader: () => contentReaderTool(),
		submit_final_answer: () => submitFinalAnswerTool(),
		inspect_note_context: () => inspectNoteContextTool(tm),
		graph_traversal: () => graphTraversalTool(tm),
		find_path: () => findPathTool(tm),
		find_key_nodes: () => findKeyNodesTool(tm),
		find_orphans: () => findOrphansTool(tm),
		search_by_dimensions: () => searchByDimensionsTool(tm),
		explore_folder: () => exploreFolderTool(tm),
		recent_changes_whole_vault: () => recentChangesWholeVaultTool(tm),
		local_search_whole_vault: () => localSearchWholeVaultTool(tm),
	};
}

/**
 * Resolve tool names from a skill definition to actual AgentTool instances.
 */
function resolveTools(
	builtinNames: string[],
	mcpNames: string[],
	tm?: TemplateManager,
): Record<string, AgentTool> {
	const builders = getToolBuilders(tm);
	const tools: Record<string, AgentTool> = {};

	// Resolve built-in tools
	for (const name of builtinNames) {
		const builder = builders[name];
		if (builder) {
			tools[name] = builder();
		} else {
			console.warn(`[SkillExecutor] Unknown built-in tool: "${name}"`);
		}
	}

	// Resolve MCP tools (whitelist filter)
	if (mcpNames.length > 0) {
		const allMcp = getAllMcpAgentTools();
		for (const name of mcpNames) {
			if (allMcp[name]) {
				tools[name] = allMcp[name];
			} else {
				console.warn(`[SkillExecutor] MCP tool not available: "${name}"`);
			}
		}
	}

	return tools;
}

/**
 * Substitute {{variableName}} placeholders in a string with input values.
 */
function substituteInputs(template: string, inputs: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
		return inputs[key] ?? '';
	});
}

export class SkillExecutor {
	/**
	 * Execute a skill with given inputs.
	 * Yields LLMStreamEvents for real-time display.
	 */
	async *execute(
		skill: SkillDefinition,
		context: SkillExecutionContext,
	): AsyncGenerator<LLMStreamEvent, SkillExecutionResult | void> {
		const triggerName = StreamTriggerName.COPILOT; // Reuse copilot trigger for now
		const startMs = Date.now();

		// Warm up SDK pool
		try {
			await warmupPool();
		} catch (err) {
			yield { type: 'error', error: err as Error, triggerName } as LLMStreamEvent;
			return;
		}

		// Resolve profile
		const profile: Profile | null = ProfileRegistry.getInstance().getActiveAgentProfile();
		if (!profile) {
			yield {
				type: 'error',
				error: new Error('No active agent profile configured. Set up a profile in Settings.'),
				triggerName,
			} as LLMStreamEvent;
			return;
		}

		const appCtx = AppContext.getInstance();
		const pluginId = appCtx.plugin.manifest.id;
		const tm = appCtx.manager.getTemplateManager?.();

		if (skill.type === 'simple') {
			const result = yield* this.executeSimple(skill, context, profile, appCtx, pluginId, tm, triggerName);
			const durationMs = Date.now() - startMs;
			return {
				skillId: skill.id,
				output: result ?? '',
				usage: { inputTokens: 0, outputTokens: 0, durationMs },
			};
		}

		// Pipeline execution
		const phaseResults: Array<{ phaseName: string; output: string }> = [];
		let prevOutput = '';

		for (const phase of skill.phases ?? []) {
			// Emit phase start marker
			yield {
				type: 'pk-debug',
				debugName: `skill-phase-${phase.name}`,
				triggerName,
				extra: { skillId: skill.id, phase: phase.name },
			} as LLMStreamEvent;

			const phaseOutput = yield* this.executePhase(
				skill, phase, context, prevOutput, profile, appCtx, pluginId, tm, triggerName,
			);
			phaseResults.push({ phaseName: phase.name, output: phaseOutput ?? '' });
			prevOutput = phaseOutput ?? '';
		}

		const durationMs = Date.now() - startMs;
		return {
			skillId: skill.id,
			output: prevOutput,
			phaseResults,
			usage: { inputTokens: 0, outputTokens: 0, durationMs },
		};
	}

	/**
	 * Execute a simple (single-phase) skill.
	 */
	private async *executeSimple(
		skill: SkillDefinition,
		context: SkillExecutionContext,
		profile: Profile,
		appCtx: AppContext,
		pluginId: string,
		tm: TemplateManager | undefined,
		triggerName: StreamTriggerName,
	): AsyncGenerator<LLMStreamEvent, string | void> {
		const builtinNames = skill.tools?.builtin ?? [];
		const mcpNames = skill.tools?.mcp ?? [];
		const tools = resolveTools(builtinNames, mcpNames, tm);
		const allTools = mergeExternalMcpTools(tools);

		const systemPrompt = substituteInputs(skill.systemPrompt, context.inputs);
		const userPrompt = this.buildUserPrompt(skill, context);

		const mcpServer = agentToolsToMcpServer(MCP_SERVER_NAME, allTools);
		const allowedTools = mcpToolNames(MCP_SERVER_NAME, allTools);

		const messages = queryWithProfile(appCtx.app, pluginId, profile, {
			prompt: userPrompt,
			systemPrompt,
			maxTurns: 20,
			mcpServers: { [MCP_SERVER_NAME]: mcpServer },
			allowedTools,
			signal: context.signal,
			usageFeature: 'skill',
			usageAction: `skill:${skill.id}`,
		});

		let acc = '';
		for await (const ev of translateSdkMessages(messages, { hasPartialMessages: true })) {
			if (ev.type === 'text-delta' && typeof (ev as any).text === 'string') {
				acc += (ev as any).text;
			}
			yield ev;
		}

		return acc;
	}

	/**
	 * Execute a single phase of a pipeline skill.
	 */
	private async *executePhase(
		skill: SkillDefinition,
		phase: SkillPhase,
		context: SkillExecutionContext,
		previousOutput: string,
		profile: Profile,
		appCtx: AppContext,
		pluginId: string,
		tm: TemplateManager | undefined,
		triggerName: StreamTriggerName,
	): AsyncGenerator<LLMStreamEvent, string | void> {
		const builtinNames = phase.tools?.builtin ?? [];
		const mcpNames = phase.tools?.mcp ?? [];
		const tools = resolveTools(builtinNames, mcpNames, tm);
		const allTools = mergeExternalMcpTools(tools);

		const phasePrompt = substituteInputs(phase.prompt, context.inputs);
		const systemPrompt = skill.systemPrompt
			? substituteInputs(skill.systemPrompt, context.inputs)
			: `You are executing phase "${phase.name}" of the "${skill.name}" skill.`;

		// Build user prompt with previous phase context
		let userPrompt = phasePrompt;
		if (previousOutput) {
			userPrompt = `## Previous Phase Output\n\n${previousOutput}\n\n## Current Phase Instructions\n\n${phasePrompt}`;
		}

		const mcpServer = agentToolsToMcpServer(MCP_SERVER_NAME, allTools);
		const allowedTools = mcpToolNames(MCP_SERVER_NAME, allTools);

		const messages = queryWithProfile(appCtx.app, pluginId, profile, {
			prompt: userPrompt,
			systemPrompt,
			maxTurns: 15,
			mcpServers: { [MCP_SERVER_NAME]: mcpServer },
			allowedTools,
			signal: context.signal,
			usageFeature: 'skill',
			usageAction: `skill:${skill.id}:${phase.name}`,
		});

		let acc = '';
		for await (const ev of translateSdkMessages(messages, { hasPartialMessages: true })) {
			if (ev.type === 'text-delta' && typeof (ev as any).text === 'string') {
				acc += (ev as any).text;
			}
			yield ev;
		}

		return acc;
	}

	/**
	 * Build the user prompt from skill inputs.
	 */
	private buildUserPrompt(skill: SkillDefinition, context: SkillExecutionContext): string {
		const parts: string[] = [];

		if (skill.inputs && skill.inputs.length > 0) {
			for (const input of skill.inputs) {
				const value = context.inputs[input.name] ?? input.default ?? '';
				if (value) {
					parts.push(`${input.description || input.name}: ${value}`);
				}
			}
		}

		if (parts.length === 0) {
			return 'Execute the skill as described in the system prompt.';
		}

		return parts.join('\n');
	}
}
