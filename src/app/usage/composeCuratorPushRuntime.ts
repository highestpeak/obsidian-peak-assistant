// T11E (2026-06-25): app-side composition for the Curator Push runtime.
//
// This file is the ONLY place that wires Obsidian `App`, the EventBus
// singleton, the chat-bridge stub, and the Curator-push Zustand store
// into the engine's ports. Service-side runtime code
// (`src/service/usage/curator/*`) must remain free of those dependencies.
//
// `composeCuratorPushRuntime(...)` returns a ready-to-`start()` runtime.
// `main.ts` calls `start()` then `AppContext.setCuratorPushRuntime(...)`
// on the app-owned `AppRuntimeRegistry`. Unload runs the symmetrical
// `clearCuratorPushRuntime()`, which invokes `dispose()` on the runtime.

import type { App } from 'obsidian';
import { EventBus, ViewEventType } from '@/core/eventBus';
import type { UsageRecordedViewEvent } from '@/core/eventBus';
import { useCuratorPushStore } from '@/ui/view/usage-dashboard/runtime/curatorPushStore';
import { getCurrentContextUtilization } from '@/ui/view/usage-dashboard/integration/chatBridge';
import { CuratorPushRuntime } from '@/service/usage/curator/CuratorPushRuntime';
import type {
	CuratorPushPayload,
} from '@/service/usage/curator/types';
import type {
	CuratorPushPorts,
	CuratorPushProjectionPort,
	ContextUtilizationPort,
	UsageEventPort,
	CuratorPushSettingsPort,
} from '@/service/usage/curator/CuratorPushPorts';

class EventBusUsageEventsAdapter implements UsageEventPort {
	constructor(private readonly app: App) {}

	onUsageRecorded(handler: (event: { costUsd: number }) => void): () => void {
		const bus = EventBus.getInstance(this.app);
		return bus.on<UsageRecordedViewEvent>(
			ViewEventType.USAGE_RECORDED,
			(event) => handler({ costUsd: event.payload.costUsd ?? 0 }),
		);
	}
}

class ChatBridgeContextAdapter implements ContextUtilizationPort {
	get() {
		return getCurrentContextUtilization();
	}
}

class CuratorPushStoreProjectionAdapter implements CuratorPushProjectionPort {
	show(payload: CuratorPushPayload): void {
		useCuratorPushStore.getState().show(payload);
	}

	reset(): void {
		useCuratorPushStore.setState({
			current: null,
			pushedThisSession: false,
			dismissedKeys: new Set(),
		});
	}

	hasPushedThisSession(): boolean {
		return useCuratorPushStore.getState().pushedThisSession;
	}

	isDismissed(dismissKey: string): boolean {
		return useCuratorPushStore.getState().dismissedKeys.has(dismissKey);
	}
}

export interface ComposeCuratorPushRuntimeOptions {
	app: App;
	/**
	 * Live accessor for the `usagePreviewEnabled` gate. Re-read on every
	 * event so settings hot-updates propagate without re-binding.
	 */
	getSettings: () => { usagePreviewEnabled: boolean };
}

export function composeCuratorPushRuntime(
	opts: ComposeCuratorPushRuntimeOptions,
): CuratorPushRuntime {
	const settings: CuratorPushSettingsPort = { get: opts.getSettings };
	const ports: CuratorPushPorts = {
		usageEvents: new EventBusUsageEventsAdapter(opts.app),
		context: new ChatBridgeContextAdapter(),
		projection: new CuratorPushStoreProjectionAdapter(),
		settings,
	};
	return new CuratorPushRuntime(ports);
}
