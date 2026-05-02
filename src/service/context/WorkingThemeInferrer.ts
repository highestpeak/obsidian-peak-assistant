import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import type { ActivityEntry, WorkingContext } from './types';

const INFERENCE_THRESHOLD = 10;
const INFERENCE_DEBOUNCE_MS = 30000;

export class WorkingThemeInferrer {
	private activitiesSinceLastInference = 0;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private isRunning = false;

	onActivity(): void {
		this.activitiesSinceLastInference++;
		if (this.activitiesSinceLastInference >= INFERENCE_THRESHOLD && !this.isRunning) {
			this.scheduleInference();
		}
	}

	forceInference(activities: ActivityEntry[]): void {
		if (this.isRunning) return;
		this.runInference(activities);
	}

	private scheduleInference(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(async () => {
			const ctx = AppContext.getSessionContext().getWorkingContext();
			await this.runInference(ctx.recentActivities);
		}, INFERENCE_DEBOUNCE_MS);
	}

	private async runInference(activities: ActivityEntry[]): Promise<void> {
		if (this.isRunning || activities.length === 0) return;
		this.isRunning = true;

		try {
			const manager = AppContext.getManager();
			const activitiesInput = activities.slice(0, 20).map(a => ({
				type: a.type,
				summary: a.summary,
				timestamp: a.timestamp,
			}));

			const response = await manager.queryText(PromptId.WorkingThemeInference, {
				activities: activitiesInput,
			});

			const parsed = JSON.parse(response.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

			const wc = AppContext.getSessionContext().getWorkingContext();
			wc.workingTheme.llmInferred = {
				summary: parsed.summary ?? '',
				relatedFiles: parsed.relatedFiles ?? [],
				updatedAt: Date.now(),
			};

			this.activitiesSinceLastInference = 0;
		} catch (err) {
			console.warn('[WorkingThemeInferrer] Failed:', err);
		} finally {
			this.isRunning = false;
		}
	}

	destroy(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
	}
}
