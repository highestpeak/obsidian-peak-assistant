/**
 * Peak Composer — WP3 capability-runtime test fakes.
 *
 * A deterministic fake executor port (scripted chunks, optional mid-stream
 * hold for cancellation tests) plus builders that compose the full document
 * capability runtime over the WP2 in-memory vault fakes. No provider, no
 * Obsidian, no timers beyond the event-wait timeout.
 */

import {
	ComposerCapabilityDocumentRuntime,
	ComposerCapabilityRegistry,
	createDefaultResultMaterializers,
	createDefaultWritebackAdapters,
	createProseCapabilityPack,
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
	type ComposerCapabilitiesConfig,
	type ComposerCapabilityExecutorPort,
	type ComposerDocumentSession,
	type ComposerExecutionRequest,
	type ComposerExecutorStreamEvent,
	type ComposerTransactionHub,
} from '@/service/composer';
import type { ComposerCapabilityRunEvent } from '@/core/composer';

export interface FakeExecutionPlan {
	chunks: string[];
	/** Pause the stream after this many chunks until `release()` is called. */
	holdAfter?: number;
}

export class FakeComposerExecutor implements ComposerCapabilityExecutorPort {
	readonly requests: ComposerExecutionRequest[] = [];
	private plans: FakeExecutionPlan[] = [];
	private holdResolve: (() => void) | null = null;

	queue(plan: FakeExecutionPlan): void {
		this.plans.push(plan);
	}

	/** Resume a stream held by `holdAfter`. */
	release(): void {
		const resolve = this.holdResolve;
		this.holdResolve = null;
		resolve?.();
	}

	async *stream(
		request: ComposerExecutionRequest,
	): AsyncGenerator<ComposerExecutorStreamEvent, void, unknown> {
		this.requests.push(request);
		const plan = this.plans.shift() ?? { chunks: ['fake output'] };
		let emitted = 0;
		for (const chunk of plan.chunks) {
			await Promise.resolve();
			if (request.signal?.aborted) return;
			yield { type: 'text-delta', text: chunk };
			emitted += 1;
			if (plan.holdAfter !== undefined && emitted === plan.holdAfter) {
				await new Promise<void>((resolve) => {
					this.holdResolve = resolve;
				});
				if (request.signal?.aborted) return;
			}
		}
		yield { type: 'complete' };
	}
}

/** Compose the full WP3 document runtime over fake ports. */
export function makeCapabilityRuntime(
	session: ComposerDocumentSession,
	hub: ComposerTransactionHub,
	executor: ComposerCapabilityExecutorPort,
	config: ComposerCapabilitiesConfig = DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
): ComposerCapabilityDocumentRuntime {
	const configProvider = () => config;
	const registry = new ComposerCapabilityRegistry(configProvider);
	registry.registerPack(createProseCapabilityPack(configProvider));
	const materializers = createDefaultResultMaterializers();
	const writebacks = createDefaultWritebackAdapters();
	registry.validateBindings(materializers, writebacks);
	return new ComposerCapabilityDocumentRuntime({
		registry,
		config: configProvider,
		executor,
		materializers,
		writebacks,
		session,
		hub,
	});
}

/** Await the next run event of a given type (with a hard timeout). */
export function nextRunEvent<T extends ComposerCapabilityRunEvent['type']>(
	runtime: ComposerCapabilityDocumentRuntime,
	type: T,
	timeoutMs = 2000,
): Promise<Extract<ComposerCapabilityRunEvent, { type: T }>> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			unsubscribe();
			reject(new Error(`timed out waiting for run event '${type}'`));
		}, timeoutMs);
		const unsubscribe = runtime.onRunEvent((event) => {
			if (event.type !== type) return;
			clearTimeout(timer);
			unsubscribe();
			resolve(event as Extract<ComposerCapabilityRunEvent, { type: T }>);
		});
	});
}

/** Collect every run event fired while `fn` executes (until it settles). */
export function collectRunEvents(
	runtime: ComposerCapabilityDocumentRuntime,
): { events: ComposerCapabilityRunEvent[]; stop: () => void } {
	const events: ComposerCapabilityRunEvent[] = [];
	const stop = runtime.onRunEvent((event) => events.push(event));
	return { events, stop };
}
