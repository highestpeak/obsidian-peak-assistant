/**
 * AiAnalysisJsonStore — AI Search analysis records persisted as `.json`.
 * ====================================================================
 *
 * Machine-generated analysis records now live as `.json` under
 * `<rootFolder>/DataStore/ai-analysis/` instead of vault Markdown. Dense
 * wikilink Markdown ballooned Obsidian's own metadata index (~2GB, OOM on
 * large vaults); JSON under DataStore is invisible to Obsidian's md-only
 * metadata cache and is already excluded from the plugin search index.
 * Markdown is demoted to an explicit user export (see `buildMarkdown`).
 * Aligned with docs/superpowers/specs/2026-07-21-machine-record-storage-jsonl-design.md.
 *
 * Concern split:
 * - This module owns the record shape, filename convention, serialization,
 *   parse, snapshot conversion, and adapter-driven save/list/load.
 * - Vault primitives come from the narrow `AiAnalysisStoreVaultAdapter`
 *   the app layer implements; no `obsidian` import crosses into core here.
 *
 * Tests: npm run test -- test/search-docs/AiAnalysisJsonStore.test.ts
 */

import { SLICE_CAPS } from '@/core/constant';
import type { CompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/analysisSnapshotTypes';
import { parse as parseAiSearchAnalysisMarkdown, toCompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';

/** Record schema version; bump only on a breaking record-shape change. */
export const AI_ANALYSIS_JSON_FORMAT_VERSION = 1 as const;

/** One persisted analysis record. `snapshot` is the full replay payload. */
export interface AiAnalysisJsonRecord {
	formatVersion: typeof AI_ANALYSIS_JSON_FORMAT_VERSION;
	savedAt: number;
	query: string;
	webEnabled: boolean;
	title?: string;
	snapshot: CompletedAnalysisSnapshot;
}

/** Lightweight list entry — enough to render + sort the recent list. */
export interface AiAnalysisJsonListEntry {
	path: string;
	savedAt: number;
	query: string;
	title?: string;
	webEnabled: boolean;
}

/**
 * Narrow vault port the store depends on. The app layer implements it over
 * the Obsidian Vault adapter; tests supply an in-memory stub. Keeps this
 * core module free of `obsidian` imports.
 */
export interface AiAnalysisStoreVaultAdapter {
	/** Create folderPath (and ancestors) if missing; no-op for empty string. */
	ensureFolder(folderPath: string): Promise<void>;
	/** True when a file already exists at path (for collision handling). */
	exists(path: string): boolean;
	/** Create a new file; must reject when the path already exists. */
	create(path: string, content: string): Promise<void>;
	/** Read file text, or null when the path is missing / not a file. */
	read(path: string): Promise<string | null>;
	/** Direct-child `.json` file paths under folderPath; empty when absent. */
	listJsonPaths(folderPath: string): string[];
}

/** Strip vault-illegal characters, matching the legacy .md save convention. */
export function sanitizeAnalysisFileName(name: string): string {
	return name
		.trim()
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.slice(0, SLICE_CAPS.ui.saveAnalyzeMd);
}

/** Filename base `<analysisStartedAtMs> - <sanitized title or query>` (no extension). */
export function buildAnalysisJsonBaseName(analysisStartedAtMs: number, titleOrQuery: string): string {
	const label = sanitizeAnalysisFileName(titleOrQuery || 'AI Search Results');
	return `${analysisStartedAtMs} - ${label}`;
}

/** Build a record from a snapshot plus save metadata. */
export function buildAnalysisJsonRecord(
	snapshot: CompletedAnalysisSnapshot,
	meta: { query: string; webEnabled: boolean; title?: string; savedAt?: number },
): AiAnalysisJsonRecord {
	return {
		formatVersion: AI_ANALYSIS_JSON_FORMAT_VERSION,
		savedAt: meta.savedAt ?? Date.now(),
		query: meta.query,
		webEnabled: meta.webEnabled,
		title: meta.title ?? snapshot.title,
		snapshot,
	};
}

export function serializeAnalysisJsonRecord(record: AiAnalysisJsonRecord): string {
	return JSON.stringify(record, null, 2);
}

/** Parse record text; returns null on malformed JSON or a missing snapshot. */
export function parseAnalysisJsonRecord(text: string): AiAnalysisJsonRecord | null {
	try {
		const parsed = JSON.parse(text) as Partial<AiAnalysisJsonRecord> | null;
		if (!parsed || typeof parsed !== 'object' || !parsed.snapshot) return null;
		return {
			formatVersion: AI_ANALYSIS_JSON_FORMAT_VERSION,
			savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
			query: typeof parsed.query === 'string' ? parsed.query : '',
			webEnabled: parsed.webEnabled === true,
			title: typeof parsed.title === 'string' ? parsed.title : undefined,
			snapshot: parsed.snapshot as CompletedAnalysisSnapshot,
		};
	} catch {
		return null;
	}
}

/** Convert a record into the replay snapshot, backfilling analysisStartedAtMs. */
export function analysisRecordToSnapshot(
	record: AiAnalysisJsonRecord,
	createdAtTs?: number,
): { snapshot: CompletedAnalysisSnapshot; query: string } {
	const fallback = Number.isFinite(createdAtTs ?? NaN) ? (createdAtTs as number) : record.savedAt;
	const startedAt = record.snapshot.analysisStartedAtMs ?? fallback ?? null;
	return {
		snapshot: { ...record.snapshot, analysisStartedAtMs: startedAt },
		query: record.query ?? '',
	};
}

/**
 * Resolve a saved analysis file (any extension) into a replay snapshot.
 * `.json` → new JSON record; anything else → legacy Markdown `parse()`
 * path unchanged. Shared by every recent-list replay call site.
 */
export function resolveAnalysisSnapshotFromVault(
	path: string,
	text: string,
	createdAtTs?: number,
): { snapshot: CompletedAnalysisSnapshot; query: string } | null {
	if (path.toLowerCase().endsWith('.json')) {
		const record = parseAnalysisJsonRecord(text);
		if (!record) return null;
		return analysisRecordToSnapshot(record, createdAtTs);
	}
	const docModel = parseAiSearchAnalysisMarkdown(text);
	const startedAt = Number.isFinite(createdAtTs ?? NaN) ? createdAtTs : undefined;
	return { snapshot: toCompletedAnalysisSnapshot(docModel, startedAt), query: docModel.query ?? '' };
}

function normalizeFolder(folderPath: string): string {
	return folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Save a record as `<folder>/<startedAtMs> - <title>.json`. On name
 * collision, appends an ISO timestamp suffix (mirrors the legacy .md rule).
 */
export async function saveAnalysisJson(
	adapter: AiAnalysisStoreVaultAdapter,
	input: { folderPath: string; analysisStartedAtMs: number; titleOrQuery: string; record: AiAnalysisJsonRecord },
): Promise<{ path: string }> {
	const folder = normalizeFolder(input.folderPath);
	if (folder) await adapter.ensureFolder(folder);
	const base = buildAnalysisJsonBaseName(input.analysisStartedAtMs, input.titleOrQuery);
	let path = folder ? `${folder}/${base}.json` : `${base}.json`;
	if (adapter.exists(path)) {
		const suffix = new Date().toISOString().replace(/[:.]/g, '-');
		path = folder ? `${folder}/${base}-${suffix}.json` : `${base}-${suffix}.json`;
	}
	await adapter.create(path, serializeAnalysisJsonRecord(input.record));
	return { path };
}

/** List every `.json` record under folderPath, newest first. */
export async function listAnalysisJson(
	adapter: AiAnalysisStoreVaultAdapter,
	folderPath: string,
): Promise<AiAnalysisJsonListEntry[]> {
	const folder = normalizeFolder(folderPath);
	const paths = adapter.listJsonPaths(folder);
	const entries: AiAnalysisJsonListEntry[] = [];
	for (const path of paths) {
		const text = await adapter.read(path);
		if (!text) continue;
		const record = parseAnalysisJsonRecord(text);
		if (!record) continue;
		entries.push({ path, savedAt: record.savedAt, query: record.query, title: record.title, webEnabled: record.webEnabled });
	}
	entries.sort((a, b) => b.savedAt - a.savedAt);
	return entries;
}

/** Load a single record by vault-relative path. */
export async function loadAnalysisJson(
	adapter: AiAnalysisStoreVaultAdapter,
	path: string,
): Promise<AiAnalysisJsonRecord | null> {
	const text = await adapter.read(path);
	if (!text) return null;
	return parseAnalysisJsonRecord(text);
}
