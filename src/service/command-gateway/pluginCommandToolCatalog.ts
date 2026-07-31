import type { PluginCommandGatewayPort } from '@/core/ports/PluginCommandGatewayPort';
import {
	OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME,
} from '@/core/types/plugin-command-gateway';
import type { ToolDef } from '@/core/types/tool';

/**
 * Defense-in-depth boundary for every Harness surface. The gateway currently
 * exposes exactly one namespaced generic tool; callers must not accept an
 * arbitrary ToolDef merely because it came through the port.
 */
export function selectApprovedPluginCommandTools(
	tools: readonly ToolDef[],
): ToolDef[] {
	const selected = tools.find(
		(tool) =>
			tool.name === OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME &&
			tool.source === 'obsidian-command',
	);
	return selected ? [selected] : [];
}

/**
 * Gateway discovery is optional enrichment for a Copilot/Chat run. A private
 * Obsidian registry change must not take down the rest of the assistant.
 */
export async function loadApprovedPluginCommandTools(
	gateway: PluginCommandGatewayPort | null | undefined,
): Promise<ToolDef[]> {
	if (!gateway) return [];
	try {
		return selectApprovedPluginCommandTools(await gateway.getToolDefinitions());
	} catch (error) {
		console.warn(
			'[PluginCommandGateway] Failed to assemble approved command tools:',
			error,
		);
		return [];
	}
}
