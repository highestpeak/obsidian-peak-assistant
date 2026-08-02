import type MyPlugin from 'main';
import type { CommandGateway } from '@/service/capabilities/CommandGateway';
import { normalizeCommandCenterBoardConfig, type CommandCenterBoardConfig } from '@/core/command-center';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { AppContext } from '@/app/context/AppContext';
import { ObsidianCommandCenterAdapter } from './ObsidianCommandCenterAdapter';
import { CommandCenterRuntime } from './CommandCenterRuntime';

export async function composeCommandCenterRuntime(
	plugin: MyPlugin,
	templateManager: TemplateManager,
	gateway: CommandGateway,
	appContext: AppContext,
): Promise<CommandCenterRuntime> {
	const rawDefaults = await templateManager.loadJson<CommandCenterBoardConfig>(ConfigTemplateId.CommandCenter);
	const defaults = normalizeCommandCenterBoardConfig(rawDefaults, rawDefaults);
	const runtime = new CommandCenterRuntime(
		defaults,
		plugin.settings.commandCenter,
		new ObsidianCommandCenterAdapter(plugin.app, plugin),
		gateway,
		async (config) => {
			plugin.settings.commandCenter = config;
			await plugin.saveSettings();
		},
		appContext,
	);
	if (!plugin.settings.commandCenter) {
		plugin.settings.commandCenter = runtime.getConfig();
		await plugin.saveSettings();
	}
	return runtime;
}
