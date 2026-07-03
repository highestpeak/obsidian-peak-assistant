// Composition entry point for the Hub Generation pipeline (Curator + Materializer +
// Executor + Scheduler). Called from main.ts once AIServiceManager, TemplateManager
// and SqliteStoreManager are ready. Also installs the regenerate fn on HubRegenService
// so stale-triggered regen goes through the agent instead of the legacy stub.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 7.

import type { App } from 'obsidian';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { SearchSettings } from '@/core/config/settingsTypes';
import { getAIHubSummaryFolder } from '@/core/config/folderPaths';
import { HubCuratorAgent } from '@/service/agents/HubCuratorAgent';
import { HubMaterializationAgent } from '@/service/agents/HubMaterializationAgent';
import { HubCurationExecutor } from '@/service/agents/hub-curation-helper/HubCurationExecutor';
import { HubGenerationRuntime } from '@/service/hub/HubGenerationRuntime';
import { HubCurationScheduler } from '@/service/hub/HubCurationScheduler';
import { HubRegenService } from '@/service/search/index/helper/hub/hubRegenService';
import {
	ObsidianVaultHubArchiveAdapter,
	ObsidianVaultHubDocAdapter,
} from './ObsidianVaultHubDocAdapter';
import { ObsidianHubMaterializationVaultReader } from './ObsidianHubMaterializationVaultReader';

export interface HubGenerationCompositionDeps {
	app: App;
	aiServiceManager: AIServiceManager;
	templateManager: TemplateManager;
	getSettings: () => SearchSettings;
	rootFolder: string;
}

export interface HubGenerationCompositionResult {
	runtime: HubGenerationRuntime;
	scheduler: HubCurationScheduler;
}

export function composeHubGenerationRuntime(
	deps: HubGenerationCompositionDeps,
): HubGenerationCompositionResult {
	if (!sqliteStoreManager.isInitialized()) {
		throw new Error(
			'composeHubGenerationRuntime: sqliteStoreManager must be initialized first.',
		);
	}

	const vaultWritePort = new ObsidianVaultHubDocAdapter(deps.app);
	const archivePort = new ObsidianVaultHubArchiveAdapter(deps.app);
	const vaultReader = new ObsidianHubMaterializationVaultReader(deps.app);

	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo('vault');
	const structuralRepo = sqliteStoreManager.getStructuralAnalysisRepo();
	const hubConstituentRepo = sqliteStoreManager.getHubConstituentRepo();
	const planRepo = sqliteStoreManager.getHubCurationPlanRepo();

	const materializer = new HubMaterializationAgent({
		aiServiceManager: deps.aiServiceManager,
		templateManager: deps.templateManager,
		mobiusNodeRepo,
		vaultReader,
		vaultWritePort,
	});

	const curator = new HubCuratorAgent({
		aiServiceManager: deps.aiServiceManager,
		templateManager: deps.templateManager,
		mobiusNodeRepo,
		structuralRepo,
		hubConstituentRepo,
		planRepo,
		vaultWritePort,
		hubSummaryFolder: getAIHubSummaryFolder(deps.rootFolder),
	});

	const executor = new HubCurationExecutor({
		materializationAgent: materializer,
		planRepo,
		mobiusNodeRepo,
		vaultWritePort,
		archivePort,
	});

	const runtime = new HubGenerationRuntime({
		curator,
		materializer,
		executor,
		planRepo,
	});

	// Install regenerate fn so HubRegenService drains hub_regen_queue through
	// the LLM materialization path instead of the legacy stub warning.
	HubRegenService.getInstance().init(deps.getSettings, runtime.buildRegenerateFn());

	const scheduler = new HubCurationScheduler({
		curator,
		executor,
		getSettings: deps.getSettings,
	});
	scheduler.init();

	return { runtime, scheduler };
}
