/**
 * Typed fallback mirroring templates/config/vault-intelligence.json.
 * Runtime edits load through TemplateManager; tests and cold boot use this import.
 */
import defaults from '../../../../templates/config/vault-intelligence.json';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';
import type {
	VaultMaintenanceTaskCategory,
	VaultMaintenanceTaskKind,
	VaultMaintenanceTaskState,
	VaultScanAiOperationId,
} from '@/core/types/vault-intelligence';

export interface VaultMaintenanceChoiceDefinition {
	id: string;
	label: string;
	description: string;
	boundary: 'peak-owned' | 'proposal' | 'no-change';
}

export interface VaultMaintenanceTaskDefinition {
	kind: VaultMaintenanceTaskKind;
	category: VaultMaintenanceTaskCategory;
	initialState: VaultMaintenanceTaskState;
	title: string;
	typeLabel: string;
	impact: 'high' | 'medium' | 'low';
	signalIds: string[];
	choices: VaultMaintenanceChoiceDefinition[];
}

export interface VaultScanOperationDefinition {
	id: VaultScanAiOperationId;
	group: 'index' | 'vault' | 'follow-up';
	label: string;
	description: string;
	defaultEnabled: boolean;
	model: string;
	provider: string;
	estimatedTokens: number;
	estimatedCostUsd: number;
}

export interface VaultIntelligenceConfig {
	activityColors: string[];
	fileTypeColors: string[];
	tasks: VaultMaintenanceTaskDefinition[];
	scanOperations: VaultScanOperationDefinition[];
}

export const DEFAULT_VAULT_INTELLIGENCE_CONFIG = defaults as VaultIntelligenceConfig;

export async function loadVaultIntelligenceConfig(): Promise<VaultIntelligenceConfig> {
	const manager = TemplateManager.getInstance();
	if (!manager) return DEFAULT_VAULT_INTELLIGENCE_CONFIG;
	try {
		const loaded = await manager.loadJson<VaultIntelligenceConfig>(ConfigTemplateId.VaultIntelligence);
		if (!Array.isArray(loaded.tasks) || !Array.isArray(loaded.scanOperations)) {
			throw new Error('tasks and scanOperations must be arrays');
		}
		return loaded;
	} catch (error) {
		console.warn('[Vault Intelligence] Invalid config; using compiled fallback.', error);
		return DEFAULT_VAULT_INTELLIGENCE_CONFIG;
	}
}
