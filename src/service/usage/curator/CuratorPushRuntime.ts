// T11E (2026-06-25): Curator runtime push — service-layer runtime.
//
// Replaces the retired `src/service/usage/CuratorRuntimePushService.ts`
// singleton. The runtime observes usage events through a port bag and
// fires at most one Curator-style recommendation per session via the
// projection port. It does not import Obsidian, AppContext, EventBus,
// Zustand, or any UI module — the composer in `src/app/usage/` wires
// those in via `CuratorPushPorts`.
//
// Thresholds match the pre-T11E behavior:
//   - context-near-limit: ratio ≥ 0.8 of model max
//   - high-spend:         session total ≥ $1.00
//   - low-mpg / model-recommendation: stubbed (parity with prior code)
//
// Throttle: at most one push per `start()` lifetime; a dismissed
// `dismissKey` is suppressed until the next `start()`.

import type { CuratorPushPorts } from './CuratorPushPorts';

const HIGH_SPEND_THRESHOLD_USD = 1.0;
const CONTEXT_WARN_RATIO = 0.8;

export class CuratorPushRuntime {
	private unsubscribe: (() => void) | null = null;
	private sessionSpendUsd = 0;

	constructor(private readonly ports: CuratorPushPorts) {}

	/**
	 * Subscribe to usage events. Must be called exactly once per runtime
	 * lifetime; double-start without an intervening dispose throws.
	 */
	start(): void {
		if (this.unsubscribe !== null) {
			throw new Error(
				'CuratorPushRuntime.start: already started; call dispose() first.',
			);
		}
		this.unsubscribe = this.ports.usageEvents.onUsageRecorded((event) =>
			this.onUsageRecorded(event.costUsd),
		);
	}

	/**
	 * Tear down subscription + reset projection. Idempotent so unload
	 * paths can call it without guarding.
	 */
	dispose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.sessionSpendUsd = 0;
		this.ports.projection.reset();
	}

	// ── trigger ────────────────────────────────────────────────────────

	private onUsageRecorded(costUsd: number): void {
		if (!this.ports.settings.get().usagePreviewEnabled) return;
		this.sessionSpendUsd += costUsd;

		if (this.ports.projection.hasPushedThisSession()) return;

		// 1. Context near limit — strongest signal, check first.
		const ctx = this.ports.context.get();
		if (ctx.max > 0 && ctx.ratio >= CONTEXT_WARN_RATIO) {
			const key = 'context-near-limit';
			if (!this.ports.projection.isDismissed(key)) {
				this.ports.projection.show({
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
			if (!this.ports.projection.isDismissed(key)) {
				this.ports.projection.show({
					reason: 'high-spend',
					title: 'Heads up — this session is adding up',
					body: `You've spent about $${this.sessionSpendUsd.toFixed(2)} in this session. Switching to a Fast Lookup model for routine follow-ups can cut cost without losing quality on simple tasks.`,
					dismissKey: key,
				});
				return;
			}
		}

		// 3/4. low-mpg + model-recommendation are deferred to a richer
		// follow-up that joins UsageOutcome data — parity with the
		// pre-T11E behavior.
	}
}
