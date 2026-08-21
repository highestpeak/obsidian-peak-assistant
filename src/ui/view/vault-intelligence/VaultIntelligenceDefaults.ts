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
	VaultScanIndexOutputId,
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
	group: 'plan' | 'index' | 'relations' | 'structure' | 'follow-up';
	label: string;
	description: string;
	defaultEnabled: boolean;
	model: string;
	provider: string;
	estimatedTokens: number;
	estimatedCostUsd: number;
}

export interface VaultScanCheckDefinition {
	checkId: string;
	/** One owner-facing task can route to multiple deterministic signals. */
	checkIds?: string[];
	label: string;
	description: string;
}

export interface VaultScanIndexOutputDefinition {
	id: VaultScanIndexOutputId;
	label: string;
	group: 'core' | 'summaries' | 'tags' | 'relationships' | 'content';
	description: string;
	availability: 'required' | 'automatic' | 'optional' | 'later';
	/** The reference setup can leave an optional output off without making it unavailable. */
	defaultEnabled?: boolean;
	operationIds: VaultScanAiOperationId[];
}

export interface VaultScanCheckGroupDefinition {
	id: 'knowledge-index' | 'content' | 'connections' | 'follow-up';
	displayOrder?: number;
	label: string;
	description: string;
	checks: VaultScanCheckDefinition[];
}

export interface VaultInventoryObjectPresentation {
	title: string;
	description: string;
	unavailableTitle: string;
	unavailableDescription: string;
}

export interface VaultIntelligenceConfig {
	activityColors: string[];
	fileTypeColors: string[];
	inventoryPreviewTypeLimit: number;
	inventoryObjects: Record<'files' | 'chats' | 'projects' | 'composer', VaultInventoryObjectPresentation>;
	checkGroups: VaultScanCheckGroupDefinition[];
	tasks: VaultMaintenanceTaskDefinition[];
	scanOperations: VaultScanOperationDefinition[];
	indexOutputs: VaultScanIndexOutputDefinition[];
}

export const DEFAULT_VAULT_INTELLIGENCE_CONFIG = defaults as VaultIntelligenceConfig;

export async function loadVaultIntelligenceConfig(): Promise<VaultIntelligenceConfig> {
	const manager = TemplateManager.getInstance();
	if (!manager) return DEFAULT_VAULT_INTELLIGENCE_CONFIG;
	try {
		const loaded = await manager.loadJson<VaultIntelligenceConfig>(ConfigTemplateId.VaultIntelligence);
		if (!loaded.inventoryObjects || !Array.isArray(loaded.checkGroups) || !Array.isArray(loaded.tasks) || !Array.isArray(loaded.scanOperations) || !Array.isArray(loaded.indexOutputs)) {
			throw new Error('inventoryObjects must exist; checkGroups, tasks, scanOperations and indexOutputs must be arrays');
		}
		return loaded;
	} catch (error) {
		console.warn('[Vault Intelligence] Invalid config; using compiled fallback.', error);
		return DEFAULT_VAULT_INTELLIGENCE_CONFIG;
	}
}
