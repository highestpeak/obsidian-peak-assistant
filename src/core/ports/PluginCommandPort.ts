import type {
	PluginCommandDescriptor,
	PluginCommandExecutionObservation,
	PluginCommandPreflight,
} from '@/core/types/plugin-command-gateway';

export interface PluginCommandExecuteOptions {
	readonly settleDelayMs: number;
	readonly maxChangedPaths: number;
}

/**
 * Narrow app-owned boundary over Obsidian's private command/plugin registries.
 * Service and UI code must not import `obsidian` or reach `app.commands`.
 */
export interface PluginCommandPort {
	discover(): Promise<readonly PluginCommandDescriptor[]>;
	preflight(commandId: string): Promise<PluginCommandPreflight>;
	execute(
		commandId: string,
		options: PluginCommandExecuteOptions,
	): Promise<PluginCommandExecutionObservation>;
}
