import type { App } from 'obsidian';
import { EventBus, ViewEventType } from '@/core/eventBus';
import type { UsageRecordedViewEvent } from '@/core/eventBus';
import { useCuratorPushStore } from '@/ui/view/usage-dashboard/runtime/curatorPushStore';
import {
	getCurrentContextUtilization,
} from '@/ui/view/usage-dashboard/integration/chatBridge';

interface CuratorPushSettings {
	usagePreviewEnabled: boolean;
}

const HIGH_SPEND_THRESHOLD_USD = 1.0;
const CONTEXT_WARN_RATIO = 0.8;
const LOW_MPG_THRESHOLD_USD = 0.5;

/**
 * Curator runtime push service (Dashboard carrier B — spec §6.1).
 *
 * Observes usage events and surfaces a single Curator-style recommendation
 * modal when one of the following signals fires:
 *
 *   - **context-near-limit** — chat context > 80% of max
 *   - **high-spend** — cumulative session cost > $1.0
 *   - **low-mpg** — MPG-style heuristic (stub for PR-Dash-4; full computation
 *     requires UsageOutcome join which we defer to a richer follow-up)
 *   - **model-recommendation** — once-per-session model swap suggestion (stub)
 *
 * Throttle: max 1 push per service lifetime (`pushedThisSession` in the
 * store). Plus per-key session dismissal — once user dismisses with "Don't
 * show this session", the same `dismissKey` is suppressed until the service
 * restarts.
 *
 * Gate: respects `settings.usagePreviewEnabled` — when off, no pushes.
 */
export class CuratorRuntimePushService {
	private static instance: CuratorRuntimePushService | null = null;

	private unsubscribe: (() => void) | null = null;
	private settings: CuratorPushSettings = { usagePreviewEnabled: true };
	private sessionSpendUsd = 0;

	static getInstance(): CuratorRuntimePushService {
		if (!CuratorRuntimePushService.instance) {
			CuratorRuntimePushService.instance = new CuratorRuntimePushService();
		}
		return CuratorRuntimePushService.instance;
	}

	init(app: App, settings: CuratorPushSettings): void {
		this.settings = { ...settings };
		const bus = EventBus.getInstance(app);
		this.unsubscribe = bus.on<UsageRecordedViewEvent>(
			ViewEventType.USAGE_RECORDED,
			(event) => this.onUsageRecorded(event.payload.costUsd ?? 0),
		);
	}

	updateSettings(next: Partial<CuratorPushSettings>): void {
		Object.assign(this.settings, next);
	}

	destroy(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.sessionSpendUsd = 0;
		useCuratorPushStore.setState({
			current: null,
			pushedThisSession: false,
			dismissedKeys: new Set(),
		});
		CuratorRuntimePushService.instance = null;
	}

	// ── triggers ────────────────────────────────────────────────

	private onUsageRecorded(costUsd: number): void {
		if (!this.settings.usagePreviewEnabled) return;
		this.sessionSpendUsd += costUsd;

		const store = useCuratorPushStore.getState();
		if (store.pushedThisSession) return;

		// 1. Context near limit — strongest signal, check first.
		const ctx = getCurrentContextUtilization();
		if (ctx.max > 0 && ctx.ratio >= CONTEXT_WARN_RATIO) {
			const key = 'context-near-limit';
			if (!store.dismissedKeys.has(key)) {
				store.show({
					reason: 'context-near-limit',
					title: 'Context is getting full',
					body: `This session has used ${Math.round(ctx.ratio * 100)}% of the model's context window. Consider starting a fresh chat or switching to a model with a larger context to keep responses sharp.`,
					dismissKey: key,
				});
				return;
			}
		}

		// 2. High spend.
		if (this.sessionSpendUsd >= HIGH_SPEND_THRESHOLD_USD) {
			const key = 'high-spend';
			if (!store.dismissedKeys.has(key)) {
				store.show({
					reason: 'high-spend',
					title: 'Heads up — this session is adding up',
					body: `You've spent about $${this.sessionSpendUsd.toFixed(2)} in this session. Switching to a Fast Lookup model for routine follow-ups can cut cost without losing quality on simple tasks.`,
					dismissKey: key,
				});
				return;
			}
		}

		// 3/4. low-mpg + model-recommendation deferred — see service header.
		void LOW_MPG_THRESHOLD_USD; // referenced to silence unused-const linters
	}
}
