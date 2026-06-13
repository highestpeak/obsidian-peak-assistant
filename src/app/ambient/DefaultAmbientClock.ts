// T8: monotonic clock adapter. Tests inject a fake clock to make
// debounce / cooldown / briefing-gap assertions deterministic.

import type { AmbientClockPort } from '@/service/ambient/ports/AmbientPorts';

export class DefaultAmbientClock implements AmbientClockPort {
	now(): number {
		return Date.now();
	}
}
