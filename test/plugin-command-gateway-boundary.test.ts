import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { AppRuntimeRegistry } from '@/app/context/AppRuntimeRegistry';

function read(relative: string): string {
	return fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
}

function testServiceBoundary(): void {
	const source = read('src/service/command-gateway/PluginCommandGatewayRuntime.ts');
	assert.ok(!/from ['"]obsidian/.test(source), 'service runtime must not import obsidian');
	assert.ok(!/from ['"]@\/app\//.test(source), 'service runtime must not import app');
	assert.ok(!/from ['"]@\/ui\//.test(source), 'service runtime must not import ui');
	assert.ok(
		source.includes('guardToolExecution({'),
		'compiled Skill quarantine must guard the generic command tool',
	);
	assert.ok(source.includes('runCapability({'), 'command execution must emit a RunEnvelope');
	assert.ok(!/CommandAgentService/.test(source), 'must not create a second command agent runtime');
	console.log('PASS: serviceBoundary');
}

function testProductionWiringAndReviewSurface(): void {
	const main = read('main.ts');
	const chat = read('src/service/chat/service-conversation.ts');
	const documentCopilot = read('src/service/copilot/CopilotMetaAgentStream.ts');
	const actionCopilot = read('src/service/copilot/actions/agent-actions.ts');
	const vaultCopilot = read('src/service/copilot/vault/VaultMetaAgentStream.ts');
	const documentComposition = read('src/app/copilot/composeCopilotReviewDeps.ts');
	const actionComposition = read('src/app/copilot/actions/composeCopilotActionRuntime.ts');
	const vaultComposition = read('src/app/copilot/vault/AppVaultReviewAgentAdapter.ts');
	const tools = read('src/ui/view/settings/tabs/ToolsTab.tsx');
	const surface = read('src/ui/view/settings/components/PluginCommandGatewaySection.tsx');
	assert.match(main, /composePluginCommandGatewayRuntime/);
	assert.match(chat, /loadApprovedPluginCommandTools/);
	assert.match(documentCopilot, /pluginCommandTools/);
	assert.match(actionCopilot, /pluginCommandTools/);
	assert.match(vaultCopilot, /pluginCommandTools/);
	assert.match(documentComposition, /tryGetPluginCommandGatewayRuntime/);
	assert.match(actionComposition, /tryGetPluginCommandGatewayRuntime/);
	assert.match(vaultComposition, /tryGetPluginCommandGatewayRuntime/);
	assert.match(tools, /PluginCommandGatewaySection/);
	assert.match(surface, /Analyze with AI|tools\.pluginCommands/);
	assert.ok(!/addCommand\(/.test(surface), 'review UI must not register palette commands');
	console.log('PASS: productionWiringAndReviewSurface');
}

async function testAppOwnedRuntimeBinding(): Promise<void> {
	const registry = new AppRuntimeRegistry();
	let disposed = false;
	const runtime = {
		async dispose() {
			disposed = true;
		},
	};
	assert.strictEqual(registry.tryGetPluginCommandGatewayRuntime(), null);
	registry.setPluginCommandGatewayRuntime(runtime as never);
	assert.strictEqual(registry.getPluginCommandGatewayRuntime(), runtime);
	assert.throws(
		() => registry.setPluginCommandGatewayRuntime(runtime as never),
		/already bound/,
	);
	registry.clearPluginCommandGatewayRuntime();
	await Promise.resolve();
	assert.strictEqual(disposed, true);
	assert.strictEqual(registry.tryGetPluginCommandGatewayRuntime(), null);
	console.log('PASS: appOwnedRuntimeBinding');
}

async function run(): Promise<void> {
	testServiceBoundary();
	testProductionWiringAndReviewSurface();
	await testAppOwnedRuntimeBinding();
	console.log('plugin-command-gateway-boundary: all guards passed');
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
