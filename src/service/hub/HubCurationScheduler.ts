// Opt-in scheduled Hub Curation runs. See
// docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 10.

import type { HubCuratorAgent } from '@/service/agents/HubCuratorAgent';
import type { HubCurationExecutor } from '@/service/agents/hub-curation-helper/HubCurationExecutor';
import type { SearchSettings } from '@/core/config/settingsTypes';

export interface HubCurationSchedulerDeps {
	curator: HubCuratorAgent;
	executor: HubCurationExecutor;
	getSettings: () => SearchSettings;
}

export class HubCurationScheduler {
	private timer: ReturnType<typeof setInterval> | null = null;
	private running = false;

	constructor(private readonly deps: HubCurationSchedulerDeps) {}

	init(): void {
		const settings = this.deps.getSettings();
		if (!settings.hubCurationSchedulerEnabled) return;
		const days = Math.max(1, Math.floor(settings.hubCurationIntervalDays ?? 7));
		const intervalMs = days * 24 * 3600 * 1000;
		this.timer = setInterval(() => {
			void this.run('scheduled');
		}, intervalMs);
	}

	async run(trigger: 'manual' | 'scheduled'): Promise<{ planId: string } | null> {
		if (this.running) return null;
		this.running = true;
		try {
			const plan = await this.deps.curator.run({ trigger });
			await this.deps.executor.execute(plan);
			return { planId: plan.planId };
		} finally {
			this.running = false;
		}
	}

	dispose(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
