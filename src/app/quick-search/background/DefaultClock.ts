// T10: Default `Date.now`-backed clock for the background runtime.
//
// Tests inject a fake clock that returns a deterministic monotonic
// counter so session IDs and `createdAt` timestamps stay stable.

import type { QuickSearchClockPort } from '@/core/ports/QuickSearchBackgroundPorts';

export class DefaultClock implements QuickSearchClockPort {
	now(): number {
		return Date.now();
	}
}
