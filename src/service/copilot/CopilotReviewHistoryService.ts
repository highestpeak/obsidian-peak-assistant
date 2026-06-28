/**
 * Persists Auto Review sessions to vault markdown files.
 *
 * Each completed (or cancelled) review writes one file at
 *   `.peak/auto-review/<sanitized-basename>-<timestamp>.md`
 *
 * Format: frontmatter metadata + embedded JSON snapshot in a code fence.
 * The JSON fence is tagged `peak-copilot-review-data` so we can locate it
 * deterministically when restoring.
 *
 * Restored sessions are read-only — the agent loop is not re-run.
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { VaultFileRef, VaultFolderRef } from '@/core/ports/VaultFileRef';
import { joinPath } from '@/core/utils/path-utils';
import { ensureFolderRecursive, getFileRef, getFolderRef, isFile } from '@/core/storage/vault/vault-ops';
import type { ReviewSessionSnapshot } from './CopilotReviewSession';

/**
 * Hook invoked once, the first time the `peak-system/` folder is
 * materialized in a vault. App-layer wires this so the user sees a Notice
 * when the folder appears; the service tier itself does not import
 * `Notice` or any Obsidian UI surface.
 */
export type CopilotReviewFolderCreatedNotifier = (message: string, durationMs: number) => void;

// Non-dotfolder so the regular Obsidian vault API works (dotfolders aren't indexed).
export const REVIEW_HISTORY_FOLDER = 'peak-system/auto-review';

const README_FILE = 'peak-system/README.md';
const FOLDER_NOTICE_FLAG = 'peak-assistant.notice.peakSystemFolder.v1';

const README_BODY = `# peak-system/

This folder stores internal data for the **Peak Assistant** plugin (Obsidian).

- \`auto-review/\` — saved Copilot Auto Review sessions (one markdown file per run, with embedded JSON snapshot)

You can safely:

- Browse these files (they are valid markdown)
- Delete individual review files to remove history
- Hide this whole folder from the file tree via **Obsidian Settings → Files & Links → Excluded files** (add \`peak-system\`)

Do **not** rename or move \`peak-system/\` or its children — the plugin looks for them by path.
`;

/**
 * Per-insight chat transcripts. Key = `${insightId}::${'follow-up' | 'draft-proposal'}`.
 * Each value is the ordered list of turns.
 */
export type InsightChatHistories = Record<string, Array<{
	role: 'user' | 'assistant';
	text: string;
	at: number;
}>>;

export type ReviewOriginScope = 'document' | 'vault';

export interface CopilotReviewHistoryRecord {
	id: string;
	storagePath: string;
	subjectPath: string;
	subjectBasename: string;
	mode: 'fast' | 'complete';
	startedAt: number;
	completedAt: number;
	status: string;
	insightCount: number;
	changeCount: number;
	sourceCount: number;
	chatFollowupCount: number;
	roundCount: number;
	turnCount: number;
	/** Short label used to distinguish a review at a glance. Falls back to "Auto review" if empty. */
	headline?: string;
	/** Which picker tab triggered this review. Defaults to 'document' for older records. */
	originScope: ReviewOriginScope;
}

const SNAPSHOT_FENCE_TAG = 'peak-copilot-review-data';
const CHATS_FENCE_TAG = 'peak-copilot-review-chats';

function sanitizeForFileName(s: string): string {
	return s
		.replace(/[\\/:*?"<>|]/g, '_')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
}

function isoTimestamp(ms: number): string {
	return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

function uniqueId(ts: number): string {
	const r = Math.random().toString(36).slice(2, 10);
	return `${ts.toString(36)}-${r}`;
}

function escapeFrontmatter(value: string): string {
	if (/[:\n"#&*?<>|%@`{}[\],]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
		return JSON.stringify(value);
	}
	return value;
}

/**
 * Pick a short label that distinguishes this review at a glance.
 * Preference: first insight title → first change title → undefined.
 * Trim to ~80 chars so the picker row stays compact.
 */
function computeHeadline(snapshot: ReviewSessionSnapshot): string | undefined {
	const trim = (s: string): string => {
		const t = s.trim().replace(/\s+/g, ' ');
		return t.length > 80 ? `${t.slice(0, 77)}…` : t;
	};
	const firstInsight = snapshot.collectorSnapshot.insights[0];
	if (firstInsight?.title) return trim(firstInsight.title);
	const firstChange = snapshot.collectorSnapshot.changes[0];
	if (firstChange?.title) return trim(firstChange.title);
	return undefined;
}

function summaryStats(snapshot: ReviewSessionSnapshot): {
	insightCount: number;
	changeCount: number;
	sourceCount: number;
	chatFollowupCount: number;
	roundCount: number;
	turnCount: number;
	startedAt: number;
	completedAt: number;
} {
	const insightCount = snapshot.collectorSnapshot.insights.length;
	const changeCount = snapshot.collectorSnapshot.changes.length;
	const sourceCount = snapshot.collectorSnapshot.sources.length;
	const chatFollowupCount = snapshot.collectorSnapshot.chatFollowups.length;
	const roundCount = snapshot.rounds.length;
	const turnCount = snapshot.rounds.reduce((sum, r) => sum + r.turnCount, 0);
	const startedAt = snapshot.rounds[0]?.startedAt ?? Date.now();
	const completedAt = snapshot.rounds[snapshot.rounds.length - 1]?.endedAt ?? Date.now();
	return { insightCount, changeCount, sourceCount, chatFollowupCount, roundCount, turnCount, startedAt, completedAt };
}

function buildMarkdown(
	record: CopilotReviewHistoryRecord,
	snapshot: ReviewSessionSnapshot,
	chats?: InsightChatHistories,
): string {
	// Strip LLM events from rounds before serializing — they're verbose and not
	// needed for UI restore (trace is rebuilt from artifacts derived elsewhere).
	// But we DO need round metadata + events for trace reconstruction.
	const persistable = {
		mode: snapshot.mode,
		signalReport: snapshot.signalReport,
		rounds: snapshot.rounds.map(r => ({
			roundIndex: r.roundIndex,
			startedAt: r.startedAt,
			endedAt: r.endedAt,
			turnCount: r.turnCount,
			events: r.events,
			submission: r.submission,
			maxTurns: r.maxTurns,
			maxTurnsReached: r.maxTurnsReached ?? false,
		})),
		collectorSnapshot: snapshot.collectorSnapshot,
		status: snapshot.status,
		error: snapshot.error,
		currentRoundIndex: snapshot.currentRoundIndex,
	};

	const lines = [
		'---',
		'type: copilot-auto-review',
		'version: 1',
		`id: ${escapeFrontmatter(record.id)}`,
		`subjectPath: ${escapeFrontmatter(record.subjectPath)}`,
		`subjectBasename: ${escapeFrontmatter(record.subjectBasename)}`,
		...(record.headline ? [`headline: ${escapeFrontmatter(record.headline)}`] : []),
		`originScope: ${record.originScope}`,
		`mode: ${record.mode}`,
		`startedAt: ${escapeFrontmatter(new Date(record.startedAt).toISOString())}`,
		`completedAt: ${escapeFrontmatter(new Date(record.completedAt).toISOString())}`,
		`status: ${escapeFrontmatter(record.status)}`,
		`insightCount: ${record.insightCount}`,
		`changeCount: ${record.changeCount}`,
		`sourceCount: ${record.sourceCount}`,
		`chatFollowupCount: ${record.chatFollowupCount}`,
		`roundCount: ${record.roundCount}`,
		`turnCount: ${record.turnCount}`,
		'---',
		'',
		`# Auto Review · ${record.subjectBasename}`,
		'',
		`Completed ${new Date(record.completedAt).toLocaleString()} · mode: ${record.mode} · ${record.roundCount} round${record.roundCount === 1 ? '' : 's'} · ${record.turnCount} turn${record.turnCount === 1 ? '' : 's'}`,
		'',
		`## Summary`,
		'',
		`- Insights: ${record.insightCount}`,
		`- Changes: ${record.changeCount}`,
		`- Sources: ${record.sourceCount}`,
		`- Chat follow-ups: ${record.chatFollowupCount}`,
		'',
		'## Insights',
		'',
	];

	for (const ins of snapshot.collectorSnapshot.insights) {
		lines.push(`### ${ins.title}`);
		lines.push('');
		lines.push(ins.body);
		lines.push('');
	}

	if (snapshot.collectorSnapshot.changes.length > 0) {
		lines.push('## Changes');
		lines.push('');
		for (const change of snapshot.collectorSnapshot.changes) {
			lines.push(`### ${change.title}`);
			lines.push('');
			for (const block of change.blocks) {
				lines.push(`**${block.heading}**`);
				if (block.rationale) lines.push(`> ${block.rationale}`);
				lines.push('');
				lines.push('```diff');
				for (const line of block.before.split('\n')) lines.push(`- ${line}`);
				for (const line of block.after.split('\n')) lines.push(`+ ${line}`);
				lines.push('```');
				lines.push('');
			}
		}
	}

	if (snapshot.collectorSnapshot.sources.length > 0) {
		lines.push('## Sources');
		lines.push('');
		for (const src of snapshot.collectorSnapshot.sources) {
			lines.push(`- [[${src.path}]] — ${src.relevance}`);
		}
		lines.push('');
	}

	lines.push('## Snapshot Data');
	lines.push('');
	lines.push('```json ' + SNAPSHOT_FENCE_TAG);
	lines.push(JSON.stringify(persistable, null, 2));
	lines.push('```');
	lines.push('');

	if (chats && Object.keys(chats).length > 0) {
		lines.push('## User Conversations');
		lines.push('');
		lines.push('```json ' + CHATS_FENCE_TAG);
		lines.push(JSON.stringify(chats, null, 2));
		lines.push('```');
		lines.push('');
	}

	return lines.join('\n');
}

function parseFenceJson<T>(markdown: string, tag: string): T | null {
	const fenceRegex = new RegExp(
		'```json\\s+' + tag + '\\s*\\n([\\s\\S]*?)\\n```',
		'm',
	);
	const match = markdown.match(fenceRegex);
	if (!match) return null;
	try {
		return JSON.parse(match[1]) as T;
	} catch (err) {
		console.warn(`[CopilotReviewHistoryService] failed to parse ${tag} JSON`, err);
		return null;
	}
}

function parseSnapshotFromMarkdown(markdown: string): ReviewSessionSnapshot | null {
	const parsed = parseFenceJson<ReviewSessionSnapshot>(markdown, SNAPSHOT_FENCE_TAG);
	if (!parsed || !parsed.collectorSnapshot) return null;
	return parsed;
}

function parseChatsFromMarkdown(markdown: string): InsightChatHistories {
	return parseFenceJson<InsightChatHistories>(markdown, CHATS_FENCE_TAG) ?? {};
}

export class CopilotReviewHistoryService {
	/**
	 * T11Q (Track B): app composes one instance via
	 * `composeCopilotReviewHistory(appContext)` and threads it through
	 * `AppContext.copilotReviewHistory` + `ServiceContext.copilotReviewHistory`.
	 * The service no longer hides an `AppContext.getInstance()` lookup.
	 */
	constructor(
		private readonly app: AppHandle,
		private readonly folderCreatedNotifier: CopilotReviewFolderCreatedNotifier | null = null,
	) {}

	/**
	 * Save (create-or-update) a review session.
	 *
	 * Pass `existingRecord` to update an in-progress session — both the file
	 * path and id are reused so the same row is upserted instead of duplicated.
	 * Without it, a fresh id + file are generated.
	 */
	async save(
		subjectPath: string,
		snapshot: ReviewSessionSnapshot,
		existingRecord?: Pick<CopilotReviewHistoryRecord, 'id' | 'storagePath' | 'originScope'>,
		chats?: InsightChatHistories,
		originScope: ReviewOriginScope = 'document',
	): Promise<CopilotReviewHistoryRecord> {
		const stats = summaryStats(snapshot);
		const id = existingRecord?.id ?? uniqueId(stats.completedAt);
		const record: CopilotReviewHistoryRecord = {
			id,
			storagePath: existingRecord?.storagePath ?? '',
			subjectPath,
			subjectBasename: snapshot.signalReport.basename,
			mode: snapshot.mode,
			startedAt: stats.startedAt,
			completedAt: stats.completedAt,
			status: snapshot.status,
			insightCount: stats.insightCount,
			changeCount: stats.changeCount,
			sourceCount: stats.sourceCount,
			chatFollowupCount: stats.chatFollowupCount,
			roundCount: stats.roundCount,
			turnCount: stats.turnCount,
			headline: computeHeadline(snapshot),
			// Scope is fixed at first save and reused on subsequent upserts.
			originScope: existingRecord?.originScope ?? originScope,
		};

		await ensureFolderRecursive(REVIEW_HISTORY_FOLDER, this.app);
		await this.ensureFolderReadme();
		if (!record.storagePath) {
			const safeName = sanitizeForFileName(snapshot.signalReport.basename) || 'untitled';
			const stamp = isoTimestamp(stats.startedAt);
			const filename = `${safeName}-${stamp}.md`;
			record.storagePath = joinPath(REVIEW_HISTORY_FOLDER, filename);
		}

		const body = buildMarkdown(record, snapshot, chats);
		const existing = getFileRef(record.storagePath, this.app);
		if (existing) {
			await this.app.vault.modify(existing, body);
		} else {
			await this.app.vault.create(record.storagePath, body);
		}

		return record;
	}

	async listAll(limit = 100, scope?: ReviewOriginScope): Promise<CopilotReviewHistoryRecord[]> {
		const folder = getFolderRef(REVIEW_HISTORY_FOLDER, this.app);
		if (!folder) return [];
		const records: CopilotReviewHistoryRecord[] = [];
		const children = (folder as VaultFolderRef & { children?: ReadonlyArray<unknown> }).children ?? [];
		for (const child of children) {
			if (!isFile(child)) continue;
			const f = child as VaultFileRef;
			if (f.extension !== 'md') continue;
			const rec = await this.readMetadata(f);
			if (!rec) continue;
			if (scope && rec.originScope !== scope) continue;
			records.push(rec);
		}
		records.sort((a, b) => b.completedAt - a.completedAt);
		return records.slice(0, limit);
	}

	async listForSubject(subjectPath: string, limit = 20, scope?: ReviewOriginScope): Promise<CopilotReviewHistoryRecord[]> {
		const all = await this.listAll(500, scope);
		return all.filter(r => r.subjectPath === subjectPath).slice(0, limit);
	}

	async load(record: CopilotReviewHistoryRecord): Promise<ReviewSessionSnapshot | null> {
		const file = getFileRef(record.storagePath, this.app);
		if (!file) return null;
		const content = await this.app.vault.read(file);
		return parseSnapshotFromMarkdown(content);
	}

	/** Load both snapshot + insight chat histories from a saved record. */
	async loadWithChats(record: CopilotReviewHistoryRecord): Promise<{
		snapshot: ReviewSessionSnapshot | null;
		chats: InsightChatHistories;
	}> {
		const file = getFileRef(record.storagePath, this.app);
		if (!file) return { snapshot: null, chats: {} };
		const content = await this.app.vault.read(file);
		return {
			snapshot: parseSnapshotFromMarkdown(content),
			chats: parseChatsFromMarkdown(content),
		};
	}

	async delete(record: CopilotReviewHistoryRecord): Promise<void> {
		const file = getFileRef(record.storagePath, this.app);
		if (file) {
			await this.app.fileManager.trashFile(file);
		}
	}

	/**
	 * Writes a one-time README into peak-system/ explaining what the folder is
	 * and how to hide it. Also shows a single Notice (per browser) the first
	 * time the folder is materialized so the user notices the new top-level
	 * folder rather than being surprised by it.
	 */
	private async ensureFolderReadme(): Promise<void> {
		const existing = getFileRef(README_FILE, this.app);
		if (existing) return;
		try {
			await this.app.vault.create(README_FILE, README_BODY);
		} catch (err) {
			// File may have appeared between the check and create (e.g. a
			// concurrent save). Silently ignore — the README only needs to
			// exist once.
			console.debug('[CopilotReviewHistoryService] README write skipped', err);
			return;
		}
		try {
			if (typeof window !== 'undefined' && !window.localStorage.getItem(FOLDER_NOTICE_FLAG)) {
				window.localStorage.setItem(FOLDER_NOTICE_FLAG, '1');
				this.folderCreatedNotifier?.(
					'Peak Assistant created a "peak-system" folder for Auto Review history. ' +
					'You can hide it via Settings → Files & Links → Excluded files.',
					8000,
				);
			}
		} catch {
			// localStorage may be unavailable (private mode, etc.); ignore.
		}
	}

	private async readMetadata(file: VaultFileRef): Promise<CopilotReviewHistoryRecord | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		if (!fm || fm.type !== 'copilot-auto-review') return null;
		const parseDate = (v: unknown): number => {
			if (typeof v !== 'string') return 0;
			const t = Date.parse(v);
			return Number.isFinite(t) ? t : 0;
		};
		const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
		const str = (v: unknown): string => (typeof v === 'string' ? v : '');
		const headlineRaw = str(fm.headline).trim();
		return {
			id: str(fm.id) || file.basename,
			storagePath: file.path,
			subjectPath: str(fm.subjectPath),
			subjectBasename: str(fm.subjectBasename) || file.basename,
			mode: (str(fm.mode) === 'fast' ? 'fast' : 'complete'),
			startedAt: parseDate(fm.startedAt),
			completedAt: parseDate(fm.completedAt),
			status: str(fm.status) || 'completed',
			insightCount: num(fm.insightCount),
			changeCount: num(fm.changeCount),
			sourceCount: num(fm.sourceCount),
			chatFollowupCount: num(fm.chatFollowupCount),
			roundCount: num(fm.roundCount),
			turnCount: num(fm.turnCount),
			headline: headlineRaw || undefined,
			originScope: str(fm.originScope) === 'vault' ? 'vault' : 'document',
		};
	}
}

