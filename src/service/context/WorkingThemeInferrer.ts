import { PromptId } from '@/core/types/prompt';
import type { ActivityEntry, WorkingTheme } from './types';

const INFERENCE_THRESHOLD = 10;
const INFERENCE_DEBOUNCE_MS = 30000;

/**
 * T11Q (Track A): owner-injected deps so the inferrer never reaches into
 * `AppContext`. SessionContextService passes through:
 *   - `getRecentActivities` so the debounced timer can re-read its working
 *     context (it does NOT touch app/sqlite directly).
 *   - `setLlmInferredTheme` to commit the parsed LLM theme back into the
 *     same working-context owner.
 *   - `queryText` to call the LLM (provided as `manager.queryText(...)`).
 *
 * Debounce + threshold behavior is unchanged.
 */
export interface WorkingThemeDeps {
	getRecentActivities(): ActivityEntry[];
	setLlmInferredTheme(theme: WorkingTheme['llmInferred']): void;
	queryText(promptId: PromptId, vars: Record<string, unknown>): Promise<string>;
}

export class WorkingThemeInferrer {
	private activitiesSinceLastInference = 0;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private isRunning = false;

	constructor(private readonly deps: WorkingThemeDeps) {}

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
			const recent = this.deps.getRecentActivities();
			await this.runInference(recent);
		}, INFERENCE_DEBOUNCE_MS);
	}

	private async runInference(activities: ActivityEntry[]): Promise<void> {
		if (this.isRunning || activities.length === 0) return;
		this.isRunning = true;

		try {
			const activitiesInput = activities.slice(0, 20).map(a => ({
				type: a.type,
				summary: a.summary,
				timestamp: a.timestamp,
			}));

			const response = await this.deps.queryText(PromptId.WorkingThemeInference, {
				activities: activitiesInput,
			});

			const parsed = JSON.parse(response.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

			this.deps.setLlmInferredTheme({
				summary: parsed.summary ?? '',
				relatedFiles: parsed.relatedFiles ?? [],
				updatedAt: Date.now(),
			});

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
