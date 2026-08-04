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
	const gatewayComposition = read('src/app/commands/gateway/composePluginCommandGatewayRuntime.ts');
	const chat = read('src/service/chat/service-conversation.ts');
	const documentCopilot = read('src/service/copilot/CopilotMetaAgentStream.ts');
	const actionCopilot = read('src/service/copilot/actions/agent-actions.ts');
	const vaultCopilot = read('src/service/copilot/vault/VaultMetaAgentStream.ts');
	const documentComposition = read('src/app/copilot/composeCopilotReviewDeps.ts');
	const actionComposition = read('src/app/copilot/actions/composeCopilotActionRuntime.ts');
	const vaultComposition = read('src/app/copilot/vault/AppVaultReviewAgentAdapter.ts');
	const tools = read('src/ui/view/settings/tabs/ToolsTab.tsx');
	const settingsEntry = read('src/ui/view/settings/components/PluginCommandGatewaySection.tsx');
	const surface = read('src/ui/view/command-gateway/PluginCommandGatewayView.tsx');
	const reviewList = read('src/ui/view/command-gateway/PluginCommandGatewayReviewList.tsx');
	const viewManager = read('src/app/ui-host/views/ViewManager.ts');
	const settingsModal = read('src/app/ui-host/modals/SettingsModal.tsx');
	const settingsCopy = read('templates/config/settings.json');
	const styles = read('src/styles/peak-components.css');
	assert.match(main, /composePluginCommandGatewayRuntime/);
	assert.match(gatewayComposition, /generatedOutputs\.resolvePath\(PLUGIN_COMMAND_GATEWAY_AUDIT_OUTPUT_ID\)/);
	assert.match(chat, /loadApprovedPluginCommandTools/);
	assert.match(documentCopilot, /pluginCommandTools/);
	assert.match(actionCopilot, /pluginCommandTools/);
	assert.match(vaultCopilot, /pluginCommandTools/);
	assert.match(documentComposition, /tryGetPluginCommandGatewayRuntime/);
	assert.match(actionComposition, /tryGetPluginCommandGatewayRuntime/);
	assert.match(vaultComposition, /tryGetPluginCommandGatewayRuntime/);
	assert.match(tools, /PluginCommandGatewaySection/);
	assert.match(settingsEntry, /openManager/);
	assert.doesNotMatch(settingsEntry, /pluginCommandGateway\.scan/);
	assert.doesNotMatch(settingsEntry, /pluginCommandGateway\.allowMany/);
	assert.match(settingsModal, /activatePluginCommandGatewayView/);
	assert.match(viewManager, /PLUGIN_COMMAND_GATEWAY_VIEW_TYPE/);
	assert.match(surface, /pluginCommandGateway\.scan\(onScanProgress\)/);
	assert.match(surface, /pluginCommandGateway\.allowMany/);
	assert.match(surface, /RecentCommandActivity/);
	assert.doesNotMatch(surface, /PopoverTrigger/);
	assert.doesNotMatch(surface, /pluginCommandScanPercent/);
	assert.match(reviewList, /role="switch"/);
	assert.match(reviewList, /pk-command-access-toggle__label/);
	assert.match(styles, /grid-template-columns:\s*30px 58px/);
	assert.doesNotMatch(styles, /pk-command-gateway-list\[data-scanning="true"\][^{]*\{[^}]*opacity:\s*0\.45/);
	assert.doesNotMatch(surface, /pluginCommandGateway\.curate\(/);
	assert.doesNotMatch(surface, /purposeLabel|onDeny|decision:\s*'deny'/);
	assert.doesNotMatch(settingsCopy, /Analyze with AI|"purposeLabel"|"deny":\s*"Block"/);
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
