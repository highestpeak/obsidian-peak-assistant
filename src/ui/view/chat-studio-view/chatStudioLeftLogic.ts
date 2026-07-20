/**
 * Pure helpers for the Chat Studio left column (Track B).
 *
 * Kept framework-free so `test/chat-studio-left-column.test.ts` can drive
 * every branch without spinning up React / Obsidian. All React code should
 * import from here rather than reimplementing the rules inline — the tests
 * are the contract, not the components.
 */

import type { ChatConversationMeta } from '@/core/types/chat';

// ---------------------------------------------------------------------------
// Time-bucket grouping (Today / Yesterday / This week / Earlier)
// ---------------------------------------------------------------------------

export const RECENT_BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'] as const;
export type RecentBucketKey = typeof RECENT_BUCKET_ORDER[number];

/**
 * Bucket a timestamp against a reference `now` (defaults to Date.now()).
 * A `ts` of 0/undefined maps to `Earlier` — the sidebar never invents a
 * timestamp, but conversations with no `createdAtTimestamp` still need a home.
 */
export function timeBucket(ts: number, now = Date.now()): RecentBucketKey {
	if (!ts) return 'Earlier';
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	const startMs = start.getTime();
	if (ts >= startMs) return 'Today';
	const diffDays = Math.floor((startMs - ts) / 86_400_000);
	if (diffDays < 1) return 'Yesterday';
	if (diffDays < 7) return 'This week';
	return 'Earlier';
}

// ---------------------------------------------------------------------------
// Pin / Recent split (LEFT-01 / L-PIN-01)
// ---------------------------------------------------------------------------

export interface PinRecentSplit<T extends { id: string; pinned?: boolean; pinnedAt?: number }> {
	pinned: T[];
	recent: T[];
}

/**
 * L-PIN-01 — a conversation appears in Pinned OR Recent, never both. Pinned
 * wins the dedupe by id and is ordered by `pinnedAt` descending (recent pins
 * first). Recent keeps its input order (caller is responsible for sorting by
 * `updatedAtTimestamp`).
 */
export function splitPinnedAndRecent<T extends { id: string; pinned?: boolean; pinnedAt?: number }>(
	items: readonly T[]
): PinRecentSplit<T> {
	const pinned: T[] = [];
	const seenIds = new Set<string>();
	for (const item of items) {
		if (item.pinned) {
			pinned.push(item);
			seenIds.add(item.id);
		}
	}
	pinned.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
	const recent = items.filter((it) => !seenIds.has(it.id));
	return { pinned, recent };
}

// ---------------------------------------------------------------------------
// View-all picker filter (LEFT-06)
// ---------------------------------------------------------------------------

export type ConversationTypeKind = 'chat' | 'agent' | 'plan' | 'canvas' | 'template' | 'custom';

/** Canonical picker filter — resets to `all` every time the picker opens. */
export interface ViewAllPickerFilter {
	query: string;
	typeKind: ConversationTypeKind | 'all';
}

export const DEFAULT_VIEW_ALL_FILTER: ViewAllPickerFilter = { query: '', typeKind: 'all' };

/** Extract canonical kind for filter matching. Missing type defaults to `chat`. */
export function conversationKind(meta: Pick<ChatConversationMeta, 'conversationType'>): ConversationTypeKind {
	return meta.conversationType?.kind ?? 'chat';
}

/**
 * L-RECENT-03 — AND semantics: item matches when title contains the trimmed
 * query (case-insensitive) AND type equals filter (or filter is `all`).
 */
export function applyViewAllFilter<T extends { title: string; conversationType?: ChatConversationMeta['conversationType'] }>(
	items: readonly T[],
	filter: ViewAllPickerFilter
): T[] {
	const q = filter.query.trim().toLowerCase();
	return items.filter((it) => {
		if (q && !(it.title || '').toLowerCase().includes(q)) return false;
		if (filter.typeKind === 'all') return true;
		return conversationKind(it) === filter.typeKind;
	});
}

// ---------------------------------------------------------------------------
// Layout width clamp / persistence codec (SHELL-03 double-click reset,
// responsive drawer widths)
// ---------------------------------------------------------------------------

export interface StudioColumnLimits {
	readonly min: number;
	readonly max: number;
	readonly default: number;
}

export const LEFT_LIMITS: StudioColumnLimits = { min: 200, max: 500, default: 248 };
// Right min is 220 per spec §5.3 (mock drag floor). Max unchanged.
export const RIGHT_LIMITS: StudioColumnLimits = { min: 220, max: 480, default: 304 };

export function clampWidth(v: number, limits: StudioColumnLimits): number {
	if (!Number.isFinite(v)) return limits.default;
	if (v < limits.min) return limits.min;
	if (v > limits.max) return limits.max;
	return Math.round(v);
}

export interface StudioLayoutPreference {
	leftWidth: number;
	rightWidth: number;
	leftCollapsed: boolean;
	rightCollapsed: boolean;
}

export const DEFAULT_LAYOUT_PREFERENCE: StudioLayoutPreference = {
	leftWidth: LEFT_LIMITS.default,
	rightWidth: RIGHT_LIMITS.default,
	leftCollapsed: false,
	rightCollapsed: false,
};

/**
 * Parse a persisted JSON blob back into a normalized preference. Any missing
 * / malformed field falls back to the default. Never throws.
 */
export function decodeLayoutPreference(raw: string | null | undefined): StudioLayoutPreference {
	if (!raw) return DEFAULT_LAYOUT_PREFERENCE;
	try {
		const parsed = JSON.parse(raw) as Partial<StudioLayoutPreference> | null;
		if (!parsed || typeof parsed !== 'object') return DEFAULT_LAYOUT_PREFERENCE;
		return {
			leftWidth: clampWidth(Number(parsed.leftWidth ?? DEFAULT_LAYOUT_PREFERENCE.leftWidth), LEFT_LIMITS),
			rightWidth: clampWidth(Number(parsed.rightWidth ?? DEFAULT_LAYOUT_PREFERENCE.rightWidth), RIGHT_LIMITS),
			leftCollapsed: Boolean(parsed.leftCollapsed),
			rightCollapsed: Boolean(parsed.rightCollapsed),
		};
	} catch {
		return DEFAULT_LAYOUT_PREFERENCE;
	}
}

export function encodeLayoutPreference(pref: StudioLayoutPreference): string {
	return JSON.stringify({
		leftWidth: clampWidth(pref.leftWidth, LEFT_LIMITS),
		rightWidth: clampWidth(pref.rightWidth, RIGHT_LIMITS),
		leftCollapsed: !!pref.leftCollapsed,
		rightCollapsed: !!pref.rightCollapsed,
	});
}

// ---------------------------------------------------------------------------
// Responsive breakpoint (SHELL-02) — <894px auto-collapses right first, then
// forces left into a drawer.
// ---------------------------------------------------------------------------

export const STUDIO_NARROW_BREAKPOINT_PX = 894;

export interface ResponsiveCollapseDecision {
	rightCollapsed: boolean;
	leftForcedDrawer: boolean;
}

/**
 * Given a container width and the user's current preference, decide which
 * columns must collapse. Never mutates the user's own explicit preference —
 * the caller layers the responsive decision on top when computing what to
 * actually render.
 */
export function decideResponsiveCollapse(
	widthPx: number,
	userPref: StudioLayoutPreference
): ResponsiveCollapseDecision {
	if (widthPx >= STUDIO_NARROW_BREAKPOINT_PX) {
		return {
			rightCollapsed: userPref.rightCollapsed,
			leftForcedDrawer: false,
		};
	}
	// Below the breakpoint we force right closed first; if there's still not
	// enough room for the middle to breathe (left+right defaults already >
	// widthPx - min-middle), we also fold left into a drawer.
	const forcedRight = true;
	const minMiddle = 440;
	const leftForcedDrawer = widthPx < LEFT_LIMITS.min + minMiddle;
	return {
		rightCollapsed: forcedRight,
		leftForcedDrawer,
	};
}
