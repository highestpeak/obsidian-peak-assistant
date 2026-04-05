/**
 * Merge structured intuition submits into working memory.
 */

import type { KnowledgeIntuitionSubmit } from '@/core/schemas';
import type { IntuitionMemory } from './types';

function normKey(s: string): string {
	return s.trim().toLowerCase();
}

/** Dedupe trimmed strings, cap length. */
function mergeStringLists(prev: string[], next: string[], max: number): string[] {
	return [...new Set([...prev, ...next].map((s) => s.trim()).filter(Boolean))].slice(0, max);
}

function mergePartitions(
	prev: IntuitionMemory['partitions'],
	next: KnowledgeIntuitionSubmit['partitions'],
): IntuitionMemory['partitions'] {
	const by = new Map<string, (typeof prev)[number]>();
	for (const p of prev) {
		by.set(normKey(p.label), { ...p });
	}
	for (const p of next) {
		const k = normKey(p.label);
		const existing = by.get(k);
		const paths = mergeStringLists(existing?.entryPaths ?? [], p.entryPaths ?? [], 2);
		if (!existing || p.purpose.length >= (existing.purpose?.length ?? 0)) {
			by.set(k, { ...p, label: p.label.trim(), entryPaths: paths });
		} else {
			by.set(k, { ...existing, entryPaths: paths });
		}
	}
	return [...by.values()].slice(0, 6);
}

function mergeEntities(
	prev: IntuitionMemory['coreEntities'],
	next: KnowledgeIntuitionSubmit['coreEntities'],
): IntuitionMemory['coreEntities'] {
	const by = new Map<string, (typeof prev)[number]>();
	for (const e of prev) {
		by.set(normKey(e.name), { ...e });
	}
	for (const e of next) {
		const k = normKey(e.name);
		const existing = by.get(k);
		if (!existing || e.description.length >= existing.description.length) {
			const w = e.whyItMatters?.trim();
			by.set(k, {
				...e,
				name: e.name.trim(),
				whyItMatters: w || existing?.whyItMatters?.trim() || '',
			});
		}
	}
	return [...by.values()].slice(0, 8);
}

function mergeTopology(
	prev: IntuitionMemory['topology'],
	next: KnowledgeIntuitionSubmit['topology'],
): IntuitionMemory['topology'] {
	const key = (t: (typeof prev)[number]) =>
		`${normKey(t.from)}\0${normKey(t.to)}\0${normKey(t.relation)}`;
	const by = new Map<string, (typeof prev)[number]>();
	for (const t of prev) {
		by.set(key(t), { ...t });
	}
	for (const t of next) {
		const k = key(t);
		const existing = by.get(k);
		if (!existing || t.relation.length >= existing.relation.length) {
			by.set(k, { ...t });
		}
	}
	return [...by.values()].slice(0, 8);
}

function mergeEntryPoints(
	prev: IntuitionMemory['entryPoints'],
	next: KnowledgeIntuitionSubmit['entryPoints'],
): IntuitionMemory['entryPoints'] {
	const by = new Map<string, (typeof prev)[number]>();
	for (const e of prev) {
		by.set(normKey(e.intent), { ...e });
	}
	for (const e of next) {
		const k = normKey(e.intent);
		const existing = by.get(k);
		const startPaths = mergeStringLists(existing?.startPaths ?? [], e.startPaths ?? [], 2);
		const whatYouWillFind = e.whatYouWillFind.trim();
		if (!existing || whatYouWillFind.length >= (existing.whatYouWillFind?.length ?? 0)) {
			by.set(k, {
				intent: e.intent.trim(),
				startPaths,
				whatYouWillFind,
			});
		} else {
			by.set(k, { ...existing, startPaths });
		}
	}
	return [...by.values()].slice(0, 24);
}

/** Empty working memory before the first submit. */
export function buildInitialIntuitionMemory(): IntuitionMemory {
	return {
		partitions: [],
		coreEntities: [],
		topology: [],
		evolution: '',
		entryPoints: [],
		openQuestions: [],
	};
}

/** Merges one submit payload into accumulated memory. */
export function mergeIntuitionSubmitIntoMemory(mem: IntuitionMemory, submit: KnowledgeIntuitionSubmit): IntuitionMemory {
	const theme = submit.theme?.trim() ? submit.theme.trim() : mem.theme;
	const evolution =
		submit.evolution.trim().length >= mem.evolution.trim().length ? submit.evolution.trim() : mem.evolution;
	const openQuestions = submit.openQuestions?.length
		? [...new Set([...mem.openQuestions, ...submit.openQuestions.map((s) => s.trim())])].filter(Boolean)
		: mem.openQuestions;

	return {
		theme,
		partitions: mergePartitions(mem.partitions, submit.partitions),
		coreEntities: mergeEntities(mem.coreEntities, submit.coreEntities),
		topology: mergeTopology(mem.topology, submit.topology),
		evolution: evolution || mem.evolution,
		entryPoints: mergeEntryPoints(mem.entryPoints, submit.entryPoints),
		openQuestions: openQuestions.slice(0, 6),
	};
}
