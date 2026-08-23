import type { FrozenModelRoute, FrozenRoutePolicy } from '@/core/types/vault-scan';

export class IndexRouteScheduler {
	private readonly active = new Map<string, number>();
	private cursor = 0;

	constructor(private readonly policy: FrozenRoutePolicy) {}

	acquire(): FrozenModelRoute | null {
		const candidates = this.policy.candidates.filter((candidate) => candidate.selectable);
		for (let offset = 0; offset < candidates.length; offset += 1) {
			const candidate = candidates[(this.cursor + offset) % candidates.length]!;
			const key = routeKey(candidate);
			const active = this.active.get(key) ?? 0;
			const limit = candidate.local ? this.policy.localMaxConcurrency : this.policy.maxConcurrency;
			if (active >= limit) continue;
			this.active.set(key, active + 1);
			this.cursor = (this.cursor + offset + 1) % candidates.length;
			return candidate;
		}
		return null;
	}

	release(route: FrozenModelRoute): void {
		const key = routeKey(route);
		const active = this.active.get(key) ?? 0;
		if (active <= 1) this.active.delete(key);
		else this.active.set(key, active - 1);
	}
}

function routeKey(route: FrozenModelRoute): string {
	return `${route.profileId}\u0000${route.provider}\u0000${route.model}`;
}
