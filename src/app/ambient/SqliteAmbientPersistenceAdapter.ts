// T11Y-7e: persistence adapter — SQL only.
//
// Before T11Y-7e this adapter mixed three concerns: push logging,
// action recording, and pattern-cache policy. The pattern policy
// (cache duration, lookback days, minimum occurrences, strength
// formula = count * avgScore) moved to
// `service/ambient/PatternLearningService.ts`; this file now only
// runs SQL.
//
// Implements:
//   - the write side of AmbientPersistencePort (`logPushes`,
//     `recordAction`)
//   - the new `AmbientPushPatternReadPort` (`findRecurringPairs`)
//
// `getLearnedPatterns` / `invalidatePatternCache` (the runtime-facing
// AmbientPersistencePort surface) are now composed in
// `composeAmbientRuntime.ts` by wrapping this adapter with
// `PatternLearningService`.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type {
	AmbientPushPatternReadPort,
	RecurringPushPair,
} from '@/core/ports/AmbientPushPatternReadPort';
import type { AmbientContext, AmbientPushItem, TriggerType, UserAction } from '@/core/types/ambient';

export class SqliteAmbientPersistenceAdapter implements AmbientPushPatternReadPort {
	async logPushes(
		context: AmbientContext,
		items: AmbientPushItem[],
		triggerType: TriggerType,
	): Promise<void> {
		const repo = sqliteStoreManager.getAmbientPushRepo();
		for (const item of items) {
			await repo.logPush({
				timestamp: item.timestamp,
				triggerType,
				sourceFilePath: context.filePath,
				contextParagraph: context.currentParagraph || null,
				pushedFilePath: item.filePath,
				pushedScore: item.score,
				explanationType: item.explanationType,
				explanationText: item.explanation,
			});
		}
	}

	async recordAction(
		sourceFilePath: string,
		pushedFilePath: string,
		action: UserAction,
	): Promise<void> {
		const repo = sqliteStoreManager.getAmbientPushRepo();
		await repo.recordAction({
			sourceFilePath,
			pushedFilePath,
			action,
			actionTs: Date.now(),
		});
	}

	async findRecurringPairs(
		withinDays: number,
		minCount: number,
	): Promise<RecurringPushPair[]> {
		const repo = sqliteStoreManager.getAmbientPushRepo();
		return repo.getRecurringPairs(withinDays, minCount);
	}
}
