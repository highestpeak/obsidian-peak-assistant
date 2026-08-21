import type { Profile, ProfileKind } from './types';

const SINGLE_ENDPOINT_LOCAL_KINDS = new Set<ProfileKind>(['ollama', 'lmstudio']);

/**
 * Local runtimes do not have separate accounts or API keys. A provider kind
 * plus its normalized endpoint is therefore the durable connection identity.
 * Other providers intentionally retain profile-level identity: two API keys
 * pointed at the same hosted endpoint can be distinct user configurations.
 */
export function localProfileConnectionIdentity(profile: Pick<Profile, 'kind' | 'baseUrl'>): string | null {
	if (!SINGLE_ENDPOINT_LOCAL_KINDS.has(profile.kind)) return null;
	return `${profile.kind}:${normalizeEndpoint(profile.baseUrl)}`;
}

export function isSameLocalProfileConnection(
	left: Pick<Profile, 'kind' | 'baseUrl'>,
	right: Pick<Profile, 'kind' | 'baseUrl'>,
): boolean {
	const leftIdentity = localProfileConnectionIdentity(left);
	return leftIdentity !== null && leftIdentity === localProfileConnectionIdentity(right);
}

/**
 * The registry remains lossless for existing configurations, but first-use UI
 * must expose one row per local service endpoint. Prefer the profile with the
 * strongest observed connection result so a stale duplicate never obscures a
 * working connection.
 */
export function collapseDuplicateLocalProfiles(
	profiles: readonly Profile[],
	connectionChecks: Readonly<Record<string, string | undefined>>,
): Profile[] {
	const canonicalByIdentity = new Map<string, Profile>();
	const output: Profile[] = [];
	for (const profile of profiles) {
		const identity = localProfileConnectionIdentity(profile);
		if (!identity) {
			output.push(profile);
			continue;
		}
		const current = canonicalByIdentity.get(identity);
		if (!current) {
			canonicalByIdentity.set(identity, profile);
			output.push(profile);
			continue;
		}
		if (connectionPriority(connectionChecks[profile.id]) <= connectionPriority(connectionChecks[current.id])) continue;
		const index = output.findIndex((candidate) => candidate.id === current.id);
		if (index !== -1) output[index] = profile;
		canonicalByIdentity.set(identity, profile);
	}
	return output;
}

function normalizeEndpoint(value: string): string {
	const trimmed = value.trim();
	try {
		const url = new URL(trimmed);
		const pathname = url.pathname.replace(/\/+$/, '');
		return `${url.protocol}//${url.host}${pathname}`.toLowerCase();
	} catch {
		return trimmed.replace(/\/+$/, '').toLowerCase();
	}
}

function connectionPriority(status: string | undefined): number {
	if (status === 'ready') return 4;
	if (status === 'checking') return 3;
	if (status === 'idle' || status === undefined) return 2;
	return 1;
}
