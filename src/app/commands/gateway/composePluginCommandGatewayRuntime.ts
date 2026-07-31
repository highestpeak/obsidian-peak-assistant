import type { App } from 'obsidian';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type {
	PluginCommandGatewayConfig,
	PluginCommandGatewaySettings,
} from '@/core/types/plugin-command-gateway';
import { ObsidianPluginCommandPort } from '@/app/platform/commands/ObsidianPluginCommandPort';
import { ObsidianPluginCommandGatewayAudit } from '@/app/platform/commands/ObsidianPluginCommandGatewayAudit';
import { PluginCommandGatewayRuntime } from '@/service/command-gateway/PluginCommandGatewayRuntime';
import { DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG } from '@/service/command-gateway/PluginCommandGatewayDefaults';

export interface ComposePluginCommandGatewayDeps {
	readonly app: App;
	readonly pluginId: string;
	readonly dataStorageFolder: string;
	readonly aiServiceManager: AIServiceManager;
	readonly templateManager: TemplateManager;
	readonly getSettings: () => MyPluginSettings;
	readonly persistSettings: (settings: PluginCommandGatewaySettings) => Promise<void>;
}

export async function composePluginCommandGatewayRuntime(
	deps: ComposePluginCommandGatewayDeps,
): Promise<PluginCommandGatewayRuntime> {
	const config = await deps.templateManager
		.loadJson<PluginCommandGatewayConfig>(ConfigTemplateId.PluginCommandGateway)
		.catch(() => DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG);
	const auditDefaults = DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG.audit;
	const audit = config?.audit ?? auditDefaults;
	const auditPort = new ObsidianPluginCommandGatewayAudit(
		deps.app,
		joinPath(deps.dataStorageFolder, 'command-gateway'),
		{
			fileName:
				typeof audit.fileName === 'string' && audit.fileName.trim()
					? audit.fileName.trim()
					: auditDefaults.fileName,
			rotationBytes: positiveInteger(audit.rotationBytes, auditDefaults.rotationBytes),
			retentionFiles: positiveInteger(audit.retentionFiles, auditDefaults.retentionFiles),
		},
	);
	return new PluginCommandGatewayRuntime({
		commandPort: new ObsidianPluginCommandPort(deps.app, deps.pluginId),
		auditPort,
		aiServiceManager: deps.aiServiceManager,
		templateManager: deps.templateManager,
		getSettings: deps.getSettings,
		persistSettings: deps.persistSettings,
	});
}

function positiveInteger(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: fallback;
}

function joinPath(...segments: string[]): string {
	return segments
		.filter(Boolean)
		.join('/')
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
}
