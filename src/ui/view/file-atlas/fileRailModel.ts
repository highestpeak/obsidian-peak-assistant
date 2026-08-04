import type { OpenDocMeta } from './FileAtlasHostPort';

export type FileRailSortMode = 'frequent' | 'name';

export interface FileRailSections {
	open: OpenDocMeta[];
	recent: OpenDocMeta[];
}

export interface BuildFileRailSectionsParams {
	openDocs: OpenDocMeta[];
	historyDocs: OpenDocMeta[];
	capacity: number;
	sortMode: FileRailSortMode;
	now: number;
	frequencyHalfLifeDays: number;
}

function comparePath(a: OpenDocMeta, b: OpenDocMeta): number {
	return a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true });
}

function compareRecent(a: OpenDocMeta, b: OpenDocMeta): number {
	const delta = b.lastViewedAt - a.lastViewedAt;
	return delta || comparePath(a, b);
}

function compareName(a: OpenDocMeta, b: OpenDocMeta): number {
	const delta = a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
	return delta || comparePath(a, b);
}

function frequencyScore(doc: OpenDocMeta, now: number, halfLifeMs: number): number {
	const ageMs = Math.max(0, now - doc.lastViewedAt);
	const recencyWeight = Math.pow(0.5, ageMs / halfLifeMs);
	return Math.max(0, doc.viewCount) * recencyWeight;
}

function sortDocs(
	docs: OpenDocMeta[],
	mode: FileRailSortMode,
	now: number,
	frequencyHalfLifeDays: number,
): OpenDocMeta[] {
	const copy = [...docs];
	if (mode === 'name') return copy.sort(compareName);
	const halfLifeMs = Math.max(1, frequencyHalfLifeDays) * 24 * 60 * 60 * 1000;
	return copy.sort((a, b) => {
		const delta = frequencyScore(b, now, halfLifeMs) - frequencyScore(a, now, halfLifeMs);
		return delta || compareRecent(a, b);
	});
}

function mergeOpenDoc(openDoc: OpenDocMeta, historyDoc: OpenDocMeta | undefined): OpenDocMeta {
	if (!historyDoc) return { ...openDoc, open: true };
	return {
		...historyDoc,
		...openDoc,
		open: true,
		lastViewedAt: Math.max(openDoc.lastViewedAt, historyDoc.lastViewedAt),
		viewCount: Math.max(openDoc.viewCount, historyDoc.viewCount),
	};
}

export function buildFileRailSections(params: BuildFileRailSectionsParams): FileRailSections {
	const historyByPath = new Map(params.historyDocs.map((doc) => [doc.path, doc]));
	const openByPath = new Map<string, OpenDocMeta>();
	for (const doc of params.openDocs) {
		const current = openByPath.get(doc.path);
		if (!current) {
			openByPath.set(doc.path, mergeOpenDoc(doc, historyByPath.get(doc.path)));
			continue;
		}
		openByPath.set(doc.path, mergeOpenDoc(
			{
				...current,
				active: current.active || doc.active,
				lastViewedAt: Math.max(current.lastViewedAt, doc.lastViewedAt),
				viewCount: Math.max(current.viewCount, doc.viewCount),
			},
			historyByPath.get(doc.path),
		));
	}

	const openPaths = new Set(openByPath.keys());
	const recentByPath = new Map<string, OpenDocMeta>();
	for (const doc of params.historyDocs) {
		if (openPaths.has(doc.path)) continue;
		const current = recentByPath.get(doc.path);
		if (current && current.lastViewedAt >= doc.lastViewedAt) continue;
		recentByPath.set(doc.path, { ...doc, open: false, active: false });
	}

	const open = sortDocs(
		[...openByPath.values()],
		params.sortMode,
		params.now,
		params.frequencyHalfLifeDays,
	);
	const recentSlots = Math.max(0, Math.max(1, params.capacity) - open.length);
	const recent = sortDocs(
		[...recentByPath.values()],
		params.sortMode,
		params.now,
		params.frequencyHalfLifeDays,
	).slice(0, recentSlots);

	return { open, recent };
}
