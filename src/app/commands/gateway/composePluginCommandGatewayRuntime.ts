import type { App } from 'obsidian';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import type {
	PluginCommandGatewayConfig,
	PluginCommandGatewaySettings,
} from '@/core/types/plugin-command-gateway';
import { PLUGIN_COMMAND_GATEWAY_AUDIT_OUTPUT_ID } from '@/core/types/plugin-command-gateway';
import { ObsidianPluginCommandPort } from '@/app/platform/commands/ObsidianPluginCommandPort';
import { ObsidianPluginCommandGatewayAudit } from '@/app/platform/commands/ObsidianPluginCommandGatewayAudit';
import { PluginCommandGatewayRuntime } from '@/service/command-gateway/PluginCommandGatewayRuntime';
import { DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG } from '@/service/command-gateway/PluginCommandGatewayDefaults';

export interface ComposePluginCommandGatewayDeps {
	readonly app: App;
	readonly pluginId: string;
	readonly aiServiceManager: AIServiceManager;
	readonly templateManager: TemplateManager;
	readonly generatedOutputs: GeneratedOutputPersistenceRuntime;
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
	const auditPath = splitFilePath(
		deps.generatedOutputs.resolvePath(PLUGIN_COMMAND_GATEWAY_AUDIT_OUTPUT_ID),
	);
	const auditPort = new ObsidianPluginCommandGatewayAudit(
		deps.app,
		auditPath.directory,
		{
			fileName: auditPath.fileName,
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

function splitFilePath(path: string): { directory: string; fileName: string } {
	const normalized = joinPath(path);
	const separator = normalized.lastIndexOf('/');
	if (separator <= 0 || separator === normalized.length - 1) {
		throw new Error(`Plugin Command Gateway audit path must name a file: ${path}`);
	}
	return {
		directory: normalized.slice(0, separator),
		fileName: normalized.slice(separator + 1),
	};
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
