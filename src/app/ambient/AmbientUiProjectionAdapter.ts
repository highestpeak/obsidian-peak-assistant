// T8: UI projection adapter. Wraps the two Ambient Zustand stores
// (`useAmbientPushStore`, `useMorningBriefingStore`) so the runtime
// never imports `@/ui/*`. The adapter is intentionally thin — every
// method maps one-to-one to a store action.

import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import type { AmbientUiProjectionPort } from '@/service/ambient/ports/AmbientPorts';
import type { AmbientPushItem, BriefingItem } from '@/service/ambient/types';

export class AmbientUiProjectionAdapter implements AmbientUiProjectionPort {
	getPushHistory(): ReadonlyMap<string, number> {
		return useAmbientPushStore.getState().pushHistory;
	}

	setItems(items: AmbientPushItem[], sourceFilePath: string): void {
		useAmbientPushStore.getState().setItems(items, sourceFilePath);
	}

	clearItems(): void {
		useAmbientPushStore.getState().clearItems();
	}

	recordPush(filePath: string, timestamp: number): void {
		useAmbientPushStore.getState().recordPush(filePath, timestamp);
	}

	updateLlmExplanation(filePath: string, explanation: string): void {
		useAmbientPushStore.getState().updateLlmExplanation(filePath, explanation);
	}

	showMorningBriefing(items: BriefingItem[]): void {
		const store = useMorningBriefingStore.getState();
		store.setItems(items);
		store.show();
	}
}
