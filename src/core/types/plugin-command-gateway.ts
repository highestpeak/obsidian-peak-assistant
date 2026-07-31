import type { CompiledSkill } from './compiled-skill';

export const OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME = 'obsidian_command_execute' as const;

export type PluginCommandRisk = 'read' | 'edit' | 'destructive' | 'unknown';

export type PluginCommandPurpose =
	| 'navigation'
	| 'capture'
	| 'planning'
	| 'tasks'
	| 'query'
	| 'formatting'
	| 'system'
	| 'other';

export type PluginCommandAvailability = 'available' | 'unavailable' | 'unknown';
export type PluginCommandInteraction = 'direct' | 'modal' | 'unknown';
export type PluginCommandObservationChannel = 'workspace' | 'vault' | 'modal' | 'none' | 'unknown';

export interface PluginCommandDescriptor {
	readonly commandId: string;
	readonly commandName: string;
	readonly pluginId: string;
	readonly pluginName: string;
	readonly pluginVersion: string;
	readonly sourceHash: string;
	readonly availability: PluginCommandAvailability;
	readonly interaction: PluginCommandInteraction;
	readonly availabilityReason?: string;
}

export interface PluginCommandPreflight {
	readonly commandId: string;
	readonly availability: PluginCommandAvailability;
	readonly reason?: string;
}

export interface PluginCommandWorkspaceSnapshot {
	readonly activeFilePath: string | null;
	readonly activeLeafType: string | null;
	readonly openModalCount: number;
	readonly vaultFileCount: number;
	readonly files: Readonly<Record<string, { mtime: number; size: number }>>;
}

export interface PluginCommandExecutionObservation {
	readonly invoked: boolean;
	readonly before: PluginCommandWorkspaceSnapshot;
	readonly after: PluginCommandWorkspaceSnapshot;
	readonly changedPaths: readonly string[];
	readonly changedPathCount: number;
	readonly changedPathsTruncated: boolean;
	readonly activeFileChanged: boolean;
	readonly activeLeafChanged: boolean;
	readonly modalCountDelta: number;
	readonly vaultFileCountDelta: number;
	readonly observableChange: boolean;
	readonly summary: string;
}

export interface PluginCommandCurationFinding {
	readonly commandId: string;
	/** Descriptor fingerprint the curator saw; findings are ignored after drift. */
	readonly sourceHash: string;
	readonly recommend: boolean;
	readonly risk: PluginCommandRisk;
	readonly purpose: PluginCommandPurpose;
	readonly summary: string;
	readonly evidence: readonly string[];
	readonly requiresActiveEditor: boolean;
	readonly interaction: PluginCommandInteraction;
	readonly expectedObservation: PluginCommandObservationChannel;
	readonly toolDescription: string;
	readonly confirmation: 'none' | 'per-run' | 'always';
	readonly skillName: string;
	readonly skillDescription: string;
	readonly skillInstructions: string;
	readonly curatedAt: number;
}

export interface PluginCommandReview {
	readonly decision: 'allow' | 'deny';
	readonly risk: PluginCommandRisk;
	readonly purpose: PluginCommandPurpose;
	readonly sourceHash: string;
	/** Fingerprint of the curator draft (or deterministic fallback) the user reviewed. */
	readonly curationHash: string;
	readonly reviewedAt: number;
}

export interface PluginCommandGatewaySettings {
	readonly reviews: Readonly<Record<string, PluginCommandReview>>;
	readonly findings: Readonly<Record<string, PluginCommandCurationFinding>>;
}

export const DEFAULT_PLUGIN_COMMAND_GATEWAY_SETTINGS: PluginCommandGatewaySettings = {
	reviews: {},
	findings: {},
};

export interface PluginCommandReviewInput {
	readonly decision: 'allow' | 'deny';
	readonly risk: PluginCommandRisk;
	readonly purpose: PluginCommandPurpose;
}

export interface PluginCommandReviewItem {
	readonly descriptor: PluginCommandDescriptor;
	readonly finding?: PluginCommandCurationFinding;
	readonly review?: PluginCommandReview;
	readonly effectiveRisk: PluginCommandRisk;
	readonly effectivePurpose: PluginCommandPurpose;
	readonly approved: boolean;
	readonly stale: boolean;
	readonly systemBlocked: boolean;
}

export interface CompiledCommandSkill extends CompiledSkill {
	readonly quarantine: 'strict';
	readonly allowedTools: readonly [typeof OBSIDIAN_COMMAND_EXECUTE_TOOL_NAME];
	readonly approvedCommands: Readonly<Record<string, CompiledCommandApproval>>;
}

export interface CompiledCommandApproval {
	readonly sourceHash: string;
	readonly curationHash: string;
	readonly risk: 'read' | 'edit';
	readonly purpose: PluginCommandPurpose;
	readonly confirmation: 'none' | 'per-run' | 'always';
}

export interface PluginCommandGatewayAuditReceipt {
	readonly schemaVersion: 1;
	readonly runId: string;
	readonly commandId: string;
	readonly commandName: string;
	readonly pluginId: string;
	readonly pluginName: string;
	readonly sourceHash: string;
	readonly curationHash: string;
	readonly compiledSkillId: string;
	readonly risk: Exclude<PluginCommandRisk, 'unknown' | 'destructive'>;
	readonly purpose: PluginCommandPurpose;
	readonly confirmation: 'none' | 'per-run' | 'always';
	readonly status: 'completed' | 'failed';
	readonly startedAt: number;
	readonly endedAt: number;
	readonly error?: string;
	readonly observation?: PluginCommandExecutionObservation;
	/** Serializable RunEnvelope event snapshots. */
	readonly events: readonly Readonly<Record<string, unknown>>[];
}

export interface PluginCommandGatewaySnapshot {
	readonly commands: readonly PluginCommandReviewItem[];
	readonly approvedCount: number;
	readonly blockedCount: number;
	readonly staleCount: number;
	readonly lastScannedAt: number;
	readonly recentRuns: readonly PluginCommandGatewayAuditReceipt[];
}

export interface PluginCommandGatewayConfig {
	readonly discovery: {
		readonly maxCommands: number;
	};
	readonly curation: {
		readonly batchSize: number;
	};
	readonly observation: {
		readonly settleDelayMs: number;
		readonly maxChangedPaths: number;
	};
	readonly audit: {
		readonly fileName: string;
		readonly rotationBytes: number;
		readonly retentionFiles: number;
		readonly recentLimit: number;
	};
	readonly classification: {
		readonly destructivePatterns: readonly string[];
		readonly editPatterns: readonly string[];
		readonly readPatterns: readonly string[];
		readonly modalPatterns: readonly string[];
		readonly purposePatterns: Readonly<
			Partial<Record<PluginCommandPurpose, readonly string[]>>
		>;
	};
}
