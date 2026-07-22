/**
 * Native availability probe for the OpenAI native image adapter (task C2 §R2).
 *
 * Composes a `NativeMediaAvailabilityProbe` that:
 *   - Returns `configured=true, provider='openai', supportedKinds=['image']`
 *     when an enabled OpenAI profile with an API key exists (or when the
 *     caller specified `nativeProfileId` and that profile is a valid
 *     enabled OpenAI profile with a key).
 *   - Returns `configured=false, reason='missing-profile'` otherwise, so
 *     preflight surfaces `needs-configuration` with `configureAction:'profiles'`.
 *
 * Pure: no I/O beyond synchronous ProfileRegistry lookups. Kept in the
 * service layer so no adapter files depend on the singleton.
 */

import type { Profile } from '@/core/profiles/types';
import type { MediaOperation } from '@/core/types/media-generation';
import type {
	NativeMediaAvailabilityProbe,
	NativeMediaAvailabilitySnapshot,
} from './preflight';

export interface OpenAiProfileLookup {
	/** Return every persisted profile. Wraps ProfileRegistry so tests can inject a stub. */
	getAllProfiles(): Profile[];
	/** Optional direct lookup used when nativeProfileId is supplied. */
	getProfileById?(id: string): Profile | null;
}

// Sora video adapter registers in the same compose call as the image
// adapter (zero-gap §5 B1) — the probe must advertise 'video' so preflight
// resolves the native route for Sora requests.
const NATIVE_KINDS_BY_PROVIDER = {
	openai: ['image', 'video'] as const,
} as const;

/** Operations the native OpenAI adapter can execute per kind. */
const NATIVE_OPS_BY_KIND: Partial<Record<string, readonly MediaOperation[]>> = {
	image: ['generate', 'edit'],
	video: ['generate'],
};

export function createOpenAiNativeAvailabilityProbe(
	lookup: OpenAiProfileLookup,
): NativeMediaAvailabilityProbe {
	return ({ kind, nativeProfileId }): NativeMediaAvailabilitySnapshot => {
		const supportedKinds = NATIVE_KINDS_BY_PROVIDER.openai;
		const supportedOperations = NATIVE_OPS_BY_KIND[kind] ?? ['generate'];
		if (!supportedKinds.includes(kind as (typeof supportedKinds)[number])) {
			return {
				configured: true, // adapter exists; kind just isn't supported
				supportedKinds,
				supportedOperations: ['generate'],
				provider: 'openai',
				reason: 'unsupported-kind',
			};
		}
		if (nativeProfileId) {
			const profile = lookup.getProfileById?.(nativeProfileId)
				?? lookup.getAllProfiles().find((p) => p.id === nativeProfileId)
				?? null;
			if (!profile || !isValidOpenAiProfile(profile)) {
				return {
					configured: false,
					supportedKinds,
					supportedOperations,
					provider: 'openai',
					reason: 'invalid-profile',
				};
			}
			return {
				configured: true,
				supportedKinds,
				supportedOperations,
				provider: 'openai',
			};
		}
		const any = lookup.getAllProfiles().find(isValidOpenAiProfile);
		if (!any) {
			return {
				configured: false,
				supportedKinds,
				supportedOperations,
				provider: 'openai',
				reason: 'missing-profile',
			};
		}
		return {
			configured: true,
			supportedKinds,
			supportedOperations,
			provider: 'openai',
		};
	};
}

/** Resolve the OpenAI profile the adapter should use for this request.
 * Returns null when no valid profile exists — callers should surface a
 * config problem instead of falling back to another provider. */
export function resolveOpenAiProfile(
	lookup: OpenAiProfileLookup,
	nativeProfileId?: string,
): Profile | null {
	if (nativeProfileId) {
		const profile = lookup.getProfileById?.(nativeProfileId)
			?? lookup.getAllProfiles().find((p) => p.id === nativeProfileId)
			?? null;
		if (profile && isValidOpenAiProfile(profile)) return profile;
		return null;
	}
	return lookup.getAllProfiles().find(isValidOpenAiProfile) ?? null;
}

function isValidOpenAiProfile(profile: Profile): boolean {
	if (profile.kind !== 'openai') return false;
	if (!profile.enabled) return false;
	if (!profile.apiKey || profile.apiKey.trim().length === 0) return false;
	return true;
}
