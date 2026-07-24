// T5 ToolDef Envelope — shape guard.
//
// Locks the T5 direction after the additive changes in
// 2026-07-02-architecture-modernization-completion-plan.md §Wave 1.C:
//   1. ToolDef carries a `source: ToolSource` origin discriminator
//      ('local' | 'mcp' | 'obsidian-command').
//   2. MCPToolAdapter exposes a direct MCP → ToolDef path
//      (`mcpToolToToolDef`, `getAllMcpToolDefs`) alongside the legacy
//      AgentTool path — one flow to the bridge, one direct T5 flow.
//   3. `adaptAgentTool` tags bridged tools with `source: 'local'` by
//      default, and accepts an override for callers that know the origin
//      (e.g. AgentTool-derived MCP tools).
//
// This test is source-level plus a small runtime probe: it doesn't spin
// up an MCPClient — it uses a stub MCPClientManager shape to exercise
// the adapter's synchronous fields (name, description, source, kind).

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { mcpToolToToolDef, getAllMcpToolDefs } from '@/service/mcp/MCPToolAdapter';
import { adaptAgentTool } from '@/service/agents/harness-bridge/agentToolAdapter';
import type { ToolDef } from '@/service/agents/harness/tool/types';

// The ToolSource union + ToolDef.source field now live in
// `core/types/tool.ts` after T2 moved the tool envelope out of service/
// so `core/ports/ToolPort.ts` can reference it cleanly. The service
// file at `agents/harness/tool/types.ts` is a re-export facade — the
// authoritative shape is in core.
const TYPES_PATH = path.resolve(
	process.cwd(),
	'src/core/types/tool.ts',
);
const MCP_ADAPTER_PATH = path.resolve(
	process.cwd(),
	'src/service/mcp/MCPToolAdapter.ts',
);
const BRIDGE_PATH = path.resolve(
	process.cwd(),
	'src/service/agents/harness-bridge/agentToolAdapter.ts',
);

const typesSource = fs.readFileSync(TYPES_PATH, 'utf8');
const mcpSource = fs.readFileSync(MCP_ADAPTER_PATH, 'utf8');
const bridgeSource = fs.readFileSync(BRIDGE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Rule 1 — ToolSource union declared with the three canonical values.
// ---------------------------------------------------------------------------

function testToolSourceUnionShape(): void {
	assert.match(
		typesSource,
		/export type ToolSource\s*=\s*(?:\r?\n\s*\|\s*)?'local'/,
		'ToolSource must declare "local"',
	);
	for (const v of ["'mcp'", "'obsidian-command'"]) {
		assert.ok(
			typesSource.includes(v),
			`ToolSource must include ${v}`,
		);
	}
	// The union must live in the harness tool types module so downstream
	// harness code (registry, permission, hooks) picks it up automatically.
	assert.match(
		typesSource,
		/export interface ToolDef[\s\S]*source\?:\s*ToolSource/,
		'ToolDef must declare `source?: ToolSource`',
	);
	console.log('PASS: toolSourceUnionShape');
}

// ---------------------------------------------------------------------------
// Rule 2 — MCP direct → ToolDef adapter exports.
// ---------------------------------------------------------------------------

function testMcpDirectAdapterExports(): void {
	assert.match(
		mcpSource,
		/export function mcpToolToToolDef\b/,
		'MCPToolAdapter must export mcpToolToToolDef',
	);
	assert.match(
		mcpSource,
		/export function getAllMcpToolDefs\b/,
		'MCPToolAdapter must export getAllMcpToolDefs',
	);
	// The direct adapter must tag source='mcp' (not 'local').
	assert.match(
		mcpSource,
		/source:\s*['"]mcp['"]/,
		'mcpToolToToolDef must tag source: "mcp"',
	);
	// The legacy AgentTool path must still exist — T5 is additive, not a
	// removal. Handbook §3 decision 6 allows the old entry to remain as a
	// facade during migration.
	assert.match(
		mcpSource,
		/export function mcpToolToAgentTool\b/,
		'Legacy mcpToolToAgentTool must still exist as a facade',
	);
	console.log('PASS: mcpDirectAdapterExports');
}

// ---------------------------------------------------------------------------
// Rule 3 — bridge respects source override.
// ---------------------------------------------------------------------------

function testBridgeAcceptsSourceOverride(): void {
	assert.match(
		bridgeSource,
		/source:\s*ToolSource\s*=\s*['"]local['"]/,
		'adaptAgentTool signature must default source to "local"',
	);
	// The bridge must import ToolSource from the harness types module —
	// this keeps the source vocabulary single-sourced.
	assert.match(
		bridgeSource,
		/import type \{[\s\S]*?ToolSource[\s\S]*?\} from ['"]@\/service\/agents\/harness\/tool\/types['"]/,
		'adaptAgentTool must import ToolSource from harness tool types',
	);
	console.log('PASS: bridgeAcceptsSourceOverride');
}

// ---------------------------------------------------------------------------
// Runtime probe — construct a ToolDef via the MCP adapter, verify shape.
// ---------------------------------------------------------------------------

interface DiscoveredTool { name: string; description?: string; inputSchema?: unknown; }
interface StubMcpManager {
	callTool(serverId: string, toolName: string, args: unknown): Promise<unknown>;
	getAllDiscoveredTools(): Array<{ serverId: string; serverName: string; tools: DiscoveredTool[] }>;
}

function makeStubManager(): StubMcpManager {
	return {
		async callTool(_serverId, _toolName, args) {
			return { echoed: args };
		},
		getAllDiscoveredTools() {
			return [
				{
					serverId: 'srv-1',
					serverName: 'peak test-server',
					tools: [
						{
							name: 'echo',
							description: 'Echoes its input back',
							inputSchema: {
								type: 'object',
								properties: { message: { type: 'string' } },
								required: ['message'],
							},
						},
						{
							name: 'noop',
							description: 'Does nothing',
						},
					],
				},
			];
		},
	};
}

async function testMcpToolToToolDefRuntime(): Promise<void> {
	const manager = makeStubManager();
	// Cast to any — the stub matches the shape mcpToolToToolDef reads
	// (callTool + getAllDiscoveredTools) but not the full MCPClientManager
	// interface.
	const tools = getAllMcpToolDefs(manager as any);
	assert.strictEqual(tools.length, 2, 'expected 2 tools from stub');

	const echo = tools[0] as ToolDef;
	assert.strictEqual(echo.source, 'mcp', 'source must be "mcp"');
	assert.strictEqual(echo.kind, 'edit', 'MCP default permission kind must be "edit"');
	assert.match(echo.name, /^mcp_peak_test_server_echo$/, `namespaced name shape: ${echo.name}`);
	assert.ok(echo.description.length > 0, 'description must be non-empty');

	// Execute smoke — passes args through the stub back.
	const result = await echo.execute(
		{ message: 'hi' },
		{ loopId: 't5-test', stepIndex: 0, tier: 'stronger', signal: new AbortController().signal },
	);
	assert.ok(result.ok, `execute failed: ${JSON.stringify(result)}`);
	console.log('PASS: mcpToolToToolDefRuntime');
}

// ---------------------------------------------------------------------------
// Runtime probe — bridge tags source='local' by default and honors override.
// ---------------------------------------------------------------------------

async function testBridgeTagsSourceRuntime(): Promise<void> {
	const legacy = {
		description: 'legacy tool',
		inputSchema: {} as any,
		async execute() { return { ok: true }; },
	};
	const localDef = adaptAgentTool('local-t', legacy);
	assert.strictEqual(localDef.source, 'local', 'default source must be "local"');

	const mcpDef = adaptAgentTool('mcp-t', legacy, 'mcp');
	assert.strictEqual(mcpDef.source, 'mcp', 'override source must be honored');

	console.log('PASS: bridgeTagsSourceRuntime');
}

// ---------------------------------------------------------------------------

async function run(): Promise<void> {
	testToolSourceUnionShape();
	testMcpDirectAdapterExports();
	testBridgeAcceptsSourceOverride();
	await testMcpToolToToolDefRuntime();
	await testBridgeTagsSourceRuntime();
	console.log('tool-def-envelope: all guards passed');
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
