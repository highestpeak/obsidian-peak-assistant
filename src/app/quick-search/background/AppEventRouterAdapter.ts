// T10: Event-router port adapter.
//
// Owns the module-level `eventTargetRedirect` switch from
// `useEventRouter.ts`. The service-side runtime calls
// `routeToBackground(sessionId, target)` to start redirecting events
// to the background session, and `clearBackgroundRoute()` to stop.

import type {
	QuickSearchEventRouterPort,
} from '@/service/search/background/ports/QuickSearchBackgroundPorts';
import type { QuickSearchBackgroundEventTarget } from '@/service/search/background/QuickSearchBackgroundTypes';
import { eventTargetRedirect } from '@/ui/view/quick-search/hooks/useEventRouter';
import type { EventDispatchTarget } from '@/ui/view/quick-search/hooks/eventDispatcher';

const NOOP_SUMMARY_BUFFER = { appendDelta: () => {}, flush: () => {} };
const NOOP_UI_STEP_REF = { get: () => null, set: () => {} };

export class AppEventRouterAdapter implements QuickSearchEventRouterPort {
	routeToBackground(_sessionId: string, target: QuickSearchBackgroundEventTarget): void {
		// The runtime treats the target as opaque; on the UI side it is
		// always an `EventDispatchTarget` produced by the target factory
		// adapter.
		eventTargetRedirect.target = target as EventDispatchTarget;
		eventTargetRedirect.summaryBuffer = NOOP_SUMMARY_BUFFER;
		eventTargetRedirect.uiStepRef = NOOP_UI_STEP_REF;
		eventTargetRedirect.active = true;
	}

	clearBackgroundRoute(_sessionId?: string): void {
		eventTargetRedirect.active = false;
		eventTargetRedirect.target = null;
		eventTargetRedirect.summaryBuffer = null;
		eventTargetRedirect.uiStepRef = null;
	}
}
