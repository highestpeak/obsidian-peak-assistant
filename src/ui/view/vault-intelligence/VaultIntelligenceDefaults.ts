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
	estimate: VaultScanOperationEstimateRule;
}

/** A model-agnostic planning rule. It is deliberately explicit and template
 * backed so Scan never presents a hand-written whole-Vault token allowance as
 * an observed measurement. */
export interface VaultScanOperationEstimateRule {
	inputShare: number;
	promptTokensPerFile: number;
	outputTokensPerFile: number;
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

export interface VaultInventoryTypeGroup {
	id: string;
	label: string;
	extensions: string[];
}

export interface VaultIntelligenceConfig {
	activityColors: string[];
	fileTypeColors: string[];
	/** Generic UTF-8 byte-to-token approximation, shared across providers. */
	scanEstimateBytesPerToken: number;
	progressPlan: {
		version: 1;
		weights: Record<'discover' | 'index' | 'ai' | 'prepare-review' | 'publish', number>;
	};
	/** Owner-facing groups derived from the source-confirmed file-format capability audit. */
	inventoryTypeGroups: VaultInventoryTypeGroup[];
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
		if (!loaded.progressPlan?.weights || !loaded.inventoryObjects || !Number.isFinite(loaded.scanEstimateBytesPerToken) || loaded.scanEstimateBytesPerToken <= 0 || !Array.isArray(loaded.inventoryTypeGroups) || !Array.isArray(loaded.checkGroups) || !Array.isArray(loaded.tasks) || !Array.isArray(loaded.scanOperations) || !loaded.scanOperations.every((operation) => operation.estimate && Number.isFinite(operation.estimate.inputShare) && Number.isFinite(operation.estimate.promptTokensPerFile) && Number.isFinite(operation.estimate.outputTokensPerFile)) || !Array.isArray(loaded.indexOutputs)) {
			throw new Error('scanEstimateBytesPerToken and per-operation estimate rules must be valid; inventoryObjects, inventoryTypeGroups, checkGroups, tasks, scanOperations and indexOutputs must exist');
		}
		return loaded;
	} catch (error) {
		console.warn('[Vault Intelligence] Invalid config; using compiled fallback.', error);
		return DEFAULT_VAULT_INTELLIGENCE_CONFIG;
	}
}
