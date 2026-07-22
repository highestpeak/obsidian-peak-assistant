/**
 * WebSearchProvider — availability boundary for native web-search adapters
 * (plan §5.2 R2).
 *
 * The plan calls out that the pre-B1 rule "catalog `webSearch: true` ⇒ suppress
 * fallback web tool" is a false-availability shortcut: no provider adapter in
 * this repo actually implements a native web-search endpoint. This module is
 * the single seam future work must extend when a real adapter lands.
 *
 * Contract (do not scatter equivalent checks):
 *   - `isNativeWebSearchAvailable(profile)`: returns true iff a real adapter can
 *     execute a search against that provider profile today.
 *   - Default: always returns false. A real Web Search Profile from
 *     ProfileRegistry (fallback) can still be injected by the availability
 *     resolver — that is a different route (see toolAvailability.ts).
 *
 * Adding a real adapter (future task):
 *   1. Implement the real fetch/API path elsewhere in `src/service/chat/tools/`.
 *   2. Register it here so `isNativeWebSearchAvailable` returns true for the
 *      matching profile kind + model id combination.
 *   3. Add a test that flips the availability from `unsupported` to `available`.
 */
import type { Profile } from '@/core/profiles/types';

/**
 * Snapshot of the resolved chat profile + model at availability-check time.
 * `capabilityFlag` is the model catalog's declared `webSearch` boolean; kept
 * on the input so future adapters that key on catalog metadata don't have to
 * re-plumb their own capability reads.
 */
export interface WebSearchNativeContext {
	profile: Profile | null;
	modelId: string | null;
	capabilityFlag: boolean;
}

export interface WebSearchProvider {
	isNativeAvailable(ctx: WebSearchNativeContext): boolean;
}

/**
 * Default: no native web-search adapter exists in this repo today. The plan
 * §5.2 R2 is explicit that catalog metadata alone must not gate injection.
 * Keep this until a real adapter ships and can be verified by a test.
 */
export const NULL_WEB_SEARCH_PROVIDER: WebSearchProvider = {
	isNativeAvailable(): boolean {
		return false;
	},
};

/**
 * Convenience wrapper the availability resolver uses. Callers can supply a
 * custom provider (tests, or a future real adapter registry) via dependency
 * injection; the default stays honest.
 */
export function isNativeWebSearchAvailable(
	ctx: WebSearchNativeContext,
	provider: WebSearchProvider = NULL_WEB_SEARCH_PROVIDER,
): boolean {
	return provider.isNativeAvailable(ctx);
}
