import assert from 'assert';
import { z } from 'zod';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { ok, type ToolDef } from '@/core/types/tool';
import { OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME } from '@/core/types/plugin-command-gateway';
import { buildChatHarnessToolsDetailed } from '@/service/chat/tools/harnessChatTools';
import {
	loadApprovedPluginCommandTools,
	selectApprovedPluginCommandTools,
} from '@/service/command-gateway/pluginCommandToolCatalog';

function testApprovedCommandToolJoinsProductionHarnessCatalog(): void {
	ProfileRegistry.resetInstance();
	const pluginCommand: ToolDef = {
		name: OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME,
		description: 'Human-approved external Obsidian command catalog.',
		source: 'obsidian-command',
		kind: 'edit',
		inputSchema: z.object({ commandId: z.string() }),
		async execute() {
			return ok({ invoked: true });
		},
	};
	const result = buildChatHarnessToolsDetailed(
		{
			app: {} as never,
			pluginId: 'obsidian-peak-assistant',
			enableWebSearch: false,
			enableVaultSearch: false,
			pluginCommandTools: [pluginCommand],
		},
		{ vision: false, pdfInput: false, tools: true, webSearch: false },
	);
	assert.strictEqual(
		result.tools.find((tool) => tool.name === OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME),
		pluginCommand,
	);
	assert.deepStrictEqual(
		result.availability.find(
			(item) => item.toolId === OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME,
		),
		{
			toolId: OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME,
			state: 'available',
		},
	);
	ProfileRegistry.resetInstance();
	console.log('PASS: approvedCommandToolJoinsProductionHarnessCatalog');
}

testApprovedCommandToolJoinsProductionHarnessCatalog();

async function testEveryHarnessSurfaceGetsOnlyTheNamespacedGatewayTool(): Promise<void> {
	const valid: ToolDef = {
		name: OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME,
		description: 'approved',
		source: 'obsidian-command',
		kind: 'read',
		inputSchema: z.object({ commandId: z.string() }),
		async execute() {
			return ok({ invoked: true });
		},
	};
	const arbitrary: ToolDef = {
		...valid,
		name: 'arbitrary_external_tool',
		source: 'mcp',
	};
	assert.deepStrictEqual(
		selectApprovedPluginCommandTools([arbitrary, valid]),
		[valid],
	);
	const loaded = await loadApprovedPluginCommandTools({
		async getToolDefinitions() {
			return [arbitrary, valid];
		},
	} as never);
	assert.deepStrictEqual(loaded, [valid]);
	const degraded = await loadApprovedPluginCommandTools({
		async getToolDefinitions() {
			throw new Error('private registry unavailable');
		},
	} as never);
	assert.deepStrictEqual(degraded, []);
	console.log('PASS: everyHarnessSurfaceGetsOnlyTheNamespacedGatewayTool');
}

void testEveryHarnessSurfaceGetsOnlyTheNamespacedGatewayTool().catch((error) => {
	console.error(error);
	process.exit(1);
});
