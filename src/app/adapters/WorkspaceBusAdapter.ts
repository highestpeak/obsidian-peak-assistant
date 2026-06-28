import { App } from 'obsidian';
import type { WorkspaceBusPort, WorkspaceBusUnsubscribe } from '@/core/ports/WorkspaceBusPort';

/**
 * T11R Phase 2: Obsidian-backed adapter for {@link WorkspaceBusPort}.
 * Wraps `app.workspace.trigger / on / offref` so `EventBus` can stay
 * in core without importing obsidian.
 */
export class WorkspaceBusAdapter implements WorkspaceBusPort {
	constructor(private readonly app: App) {}

	emit(eventType: string, payload: unknown): void {
		this.app.workspace.trigger(eventType as Parameters<App['workspace']['trigger']>[0], payload);
	}

	subscribe(eventType: string, handler: (payload: unknown) => void): WorkspaceBusUnsubscribe {
		const ref = this.app.workspace.on(
			eventType as Parameters<App['workspace']['on']>[0],
			handler as Parameters<App['workspace']['on']>[1],
		);
		return () => this.app.workspace.offref(ref);
	}
}
