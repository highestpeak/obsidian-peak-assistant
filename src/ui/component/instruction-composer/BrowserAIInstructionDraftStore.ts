import type { AIInstructionDraftStore } from '@/core/instruction-composer';

const PREFIX = 'peak.ai-instruction';
const HISTORY_LIMIT = 30;

function storage(): Storage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

function draftStorageKey(key: string): string {
	return `${PREFIX}.draft.${key}`;
}

function historyStorageKey(key: string): string {
	return `${PREFIX}.history.${key}`;
}

function readHistory(key: string): string[] {
	const raw = storage()?.getItem(historyStorageKey(key));
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === 'string')
			: [];
	} catch {
		return [];
	}
}

/**
 * Small UI-platform adapter. Domain behavior depends only on the neutral
 * AIInstructionDraftStore port; localStorage is replaceable by another host.
 */
export class BrowserAIInstructionDraftStore implements AIInstructionDraftStore {
	load(key: string): string | null {
		return storage()?.getItem(draftStorageKey(key)) ?? null;
	}

	save(key: string, value: string): void {
		storage()?.setItem(draftStorageKey(key), value);
	}

	clear(key: string): void {
		storage()?.removeItem(draftStorageKey(key));
	}

	recent(key: string, limit: number): readonly string[] {
		return readHistory(key).slice(0, Math.max(0, limit));
	}

	record(key: string, instruction: string): void {
		const trimmed = instruction.trim();
		if (!trimmed) return;
		const history = [
			trimmed,
			...readHistory(key).filter((item) => item !== trimmed),
		].slice(0, HISTORY_LIMIT);
		storage()?.setItem(historyStorageKey(key), JSON.stringify(history));
	}
}
