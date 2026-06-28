import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { QueryPatternRepo } from '@/core/storage/sqlite/repositories/QueryPatternRepo';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { buildSeedRecords } from '@/service/context/seed-patterns';
import { runPatternDiscovery } from '@/service/agents/PatternDiscoveryAgent';
import { mergeDiscoveredPatterns } from '@/service/PatternMergeService';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';

// ─── Constants ────────────────────────────────────────────────────────────────

const DISCOVERY_THRESHOLD = 20;

// ─── Module-level state ───────────────────────────────────────────────────────

let queryCounter = 0;
let lastDiscoveryTs = 0;

// ─── Private helpers ──────────────────────────────────────────────────────────

function getQueryPatternRepo(): QueryPatternRepo | null {
	// Prefer the proper accessor added by Task 13
	if (typeof (sqliteStoreManager as any).getQueryPatternRepo === 'function') {
		return (sqliteStoreManager as any).getQueryPatternRepo() as QueryPatternRepo;
	}
	// Fallback: create repo from metaStore Kysely instance directly
	const metaKdb = (sqliteStoreManager as any).metaStore?.kysely?.();
	if (!metaKdb) return null;
	return new QueryPatternRepo(metaKdb);
}

async function triggerDiscovery(prompter: IAgentPrompter): Promise<void> {
	if (!sqliteStoreManager.isInitialized()) return;
	if (!ProfileRegistry.getInstance().getActiveAgentProfile()) return;

	try {
		const patternRepo = getQueryPatternRepo();
		if (!patternRepo) {
			console.warn('[PatternDiscovery] Cannot get QueryPatternRepo — skipping discovery');
			return;
		}

		const analysisRepo = sqliteStoreManager.getAIAnalysisRepo();
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo('vault');

		// Gather inputs
		const [frequentRaw, existingPatterns, topFolders] = await Promise.all([
			analysisRepo.frequentQueries(50),
			patternRepo.listActive(),
			mobiusNodeRepo.listTopFoldersForSearchOrient(30),
		]);

		const newQueries = frequentRaw.map((r) => ({
			query: r.query,
			count: r.count,
			lastUsedAt: Date.now(),
		}));

		const patternInput = existingPatterns.map((p) => ({
			id: p.id,
			template: p.template,
			variables: (() => {
				try { return JSON.parse(p.variables); } catch { return []; }
			})(),
			conditions: (() => {
				try { return JSON.parse(p.conditions); } catch { return {}; }
			})(),
		}));

		const vaultStructure = {
			folders: topFolders.map((f) => f.folder_path),
			commonTags: [],
			commonProperties: [],
		};

		// Run discovery agent
		const output = await runPatternDiscovery(
			{
				newQueries,
				existingPatterns: patternInput,
				vaultStructure,
			},
			prompter,
		);

		if (output) {
			const stats = await mergeDiscoveredPatterns(patternRepo, output);
			console.log(`[PatternDiscovery] Discovery complete: inserted=${stats.inserted}, deprecated=${stats.deprecated}`);
		}

		lastDiscoveryTs = Date.now();
	} catch (err) {
		console.error('[PatternDiscovery] triggerDiscovery error:', err);
	}
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Called on plugin load. Seeds initial patterns if the table is empty, then
 * runs an initial discovery pass if enough analyses already exist.
 *
 * The caller injects the {@link IAgentPrompter} (AIServiceManager) so this
 * service-layer trigger doesn't need to reach back into the app layer.
 */
export async function initPatternSystem(prompter: IAgentPrompter): Promise<void> {
	if (!sqliteStoreManager.isInitialized()) return;

	const patternRepo = getQueryPatternRepo();
	if (!patternRepo) {
		console.warn('[PatternDiscovery] initPatternSystem: QueryPatternRepo unavailable');
		return;
	}

	// Seed defaults if the table is empty
	const empty = await patternRepo.isEmpty();
	if (empty) {
		const seeds = buildSeedRecords();
		for (const seed of seeds) {
			await patternRepo.insert(seed as any);
		}
		console.log(`[PatternDiscovery] Seeded ${seeds.length} default patterns`);
	}

	// If there are already enough analyses, kick off an initial discovery run
	try {
		const analysisRepo = sqliteStoreManager.getAIAnalysisRepo();
		const count = await analysisRepo.count();
		if (count >= DISCOVERY_THRESHOLD) {
			triggerDiscovery(prompter).catch((e) =>
				console.error('[PatternDiscovery] Initial discovery error:', e),
			);
		}
	} catch (e) {
		console.debug('[PatternDiscovery] initPatternSystem: analysis count check skipped:', e);
	}
}

/**
 * Called after each AI analysis completes.
 * Increments the counter and fires discovery when the threshold is reached.
 *
 * `prompter` is supplied by the caller (resolved lazily via
 * {@link AIAnalysisHistoryService}'s `prompterProvider`) — `null` means the
 * AI service isn't wired yet, so we skip discovery this round.
 */
export function onAnalysisComplete(prompter: IAgentPrompter | null): void {
	if (!sqliteStoreManager.isInitialized()) return;
	if (!ProfileRegistry.getInstance().getActiveAgentProfile()) return;
	queryCounter++;
	if (queryCounter >= DISCOVERY_THRESHOLD) {
		queryCounter = 0;
		if (!prompter) return;
		triggerDiscovery(prompter).catch((e) =>
			console.error('[PatternDiscovery] triggerDiscovery error:', e),
		);
	}
}
