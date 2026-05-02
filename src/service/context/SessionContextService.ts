import type { App, TFile, EventRef } from 'obsidian';
import type { EventBus } from '@/core/eventBus';
import { ViewEventType } from '@/core/eventBus';
import type { MobiusOperationRow } from '@/core/storage/sqlite/repositories/MobiusOperationRepo';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type {
	ActivityEntry,
	OperationType,
	WorkingContext,
	WorkingTheme,
} from './types';
import { WorkingThemeInferrer } from './WorkingThemeInferrer';

/** Activities older than this are excluded from the working context. */
const DECAY_WINDOW_MS = 30 * 60 * 1000;

/** Two operations of the same type within this window share a continuous_group_id. */
const CONTINUOUS_GROUP_THRESHOLD_MS = 3000;

/** Maximum activities kept in-memory (prevents unbounded growth during long sessions). */
const MAX_ACTIVITIES = 200;

/** Map EventBus event types → OperationType values. */
const EVENT_TO_OP: Partial<Record<ViewEventType, OperationType>> = {
	[ViewEventType.MESSAGE_SENT]: 'chat_message',
	[ViewEventType.COPILOT_ACTION]: 'copilot_action',
	[ViewEventType.SEARCH_QUERY]: 'search_query',
	[ViewEventType.AI_ANALYSIS_COMPLETE]: 'ai_analysis_complete',
	[ViewEventType.RESOURCE_ATTACHED]: 'resource_attach',
};

/** Map DB operation_type strings → OperationType. */
const ROW_TYPE_TO_OP: Record<string, OperationType> = {
	chat_message: 'chat_message',
	ai_analysis_complete: 'ai_analysis_complete',
	ai_analysis: 'ai_analysis_complete', // legacy name from MobiusOperationType.AI_ANALYSIS
	copilot_action: 'copilot_action',
	file_open: 'file_open',
	resource_attach: 'resource_attach',
	search_query: 'search_query',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parentFolder(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	return idx > 0 ? filePath.slice(0, idx) : '/';
}

function safeParseMeta(json: string | null): Record<string, unknown> | undefined {
	if (!json) return undefined;
	try {
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function extractRelatedPaths(row: MobiusOperationRow): string[] {
	const paths: string[] = [];
	const meta = safeParseMeta(row.meta_json);
	if (meta) {
		if (typeof meta.vault_rel_path === 'string') paths.push(meta.vault_rel_path);
		if (typeof meta.path === 'string') paths.push(meta.path);
		if (Array.isArray(meta.paths)) {
			for (const p of meta.paths) {
				if (typeof p === 'string') paths.push(p);
			}
		}
	}
	return paths;
}

// ─── SessionContextService ───────────────────────────────────────────────────

export class SessionContextService {
	private static instance: SessionContextService | null = null;

	private readonly app: App;
	private readonly eventBus: EventBus;
	private readonly themeInferrer = new WorkingThemeInferrer();

	private context: WorkingContext;
	private unsubscribers: Array<() => void> = [];
	private fileOpenRef: EventRef | null = null;

	/** Track last operation per type for continuous group assignment. */
	private lastOpByType: Map<string, { ts: number; groupId: string }> = new Map();

	private constructor(app: App, eventBus: EventBus) {
		this.app = app;
		this.eventBus = eventBus;
		this.context = {
			activeFile: null,
			recentActivities: [],
			workingTheme: {
				ruleBased: { topTags: [], topFolders: [], topKeywords: [], summary: '' },
				llmInferred: null,
			},
			updatedAt: Date.now(),
		};
	}

	static getInstance(app?: App, eventBus?: EventBus): SessionContextService {
		if (!SessionContextService.instance) {
			if (!app || !eventBus) {
				throw new Error('SessionContextService.getInstance requires app and eventBus on first call');
			}
			SessionContextService.instance = new SessionContextService(app, eventBus);
		}
		return SessionContextService.instance;
	}

	static destroyInstance(): void {
		if (SessionContextService.instance) {
			SessionContextService.instance.destroy();
			SessionContextService.instance = null;
		}
	}

	// ── Lifecycle ────────────────────────────────────────────────────────────

	async init(): Promise<void> {
		await this.rebuildFromSqlite();
		this.subscribeEvents();
	}

	getWorkingContext(): WorkingContext {
		return this.context;
	}

	destroy(): void {
		this.themeInferrer.destroy();
		for (const unsub of this.unsubscribers) {
			try { unsub(); } catch { /* swallow */ }
		}
		this.unsubscribers = [];
		if (this.fileOpenRef) {
			this.app.workspace.offref(this.fileOpenRef);
			this.fileOpenRef = null;
		}
	}

	// ── Public write API ────────────────────────────────────────────────────

	async recordActivity(params: {
		type: OperationType;
		summary: string;
		relatedPaths?: string[];
		importanceLevel?: 0 | 1 | 2;
		metadata?: Record<string, unknown>;
		relatedKind?: string | null;
		relatedId?: string | null;
	}): Promise<void> {
		const now = Date.now();
		const id = generateUuidWithoutHyphens();
		const groupId = this.assignContinuousGroup(params.type, now);

		const entry: ActivityEntry = {
			id,
			type: params.type,
			timestamp: now,
			summary: params.summary,
			relatedPaths: params.relatedPaths ?? [],
			importanceLevel: params.importanceLevel ?? 0,
			metadata: params.metadata,
		};

		// Persist to SQLite (best-effort; don't block callers on failure)
		try {
			const repo = SqliteStoreManager.getInstance().getMobiusOperationRepo();
			await repo.insertRow({
				id,
				operation_type: params.type,
				operation_desc: params.summary.slice(0, 500),
				created_at: now,
				related_kind: params.relatedKind ?? null,
				related_id: params.relatedId ?? null,
				important_level: params.importanceLevel ?? null,
				continuous_group_id: groupId,
				meta_json: params.metadata ? JSON.stringify(params.metadata) : null,
			});
		} catch (err) {
			console.warn('[SessionContextService] Failed to persist activity', err);
		}

		this.appendActivity(entry);
	}

	// ── Static pure functions (testable) ─────────────────────────────────────

	/**
	 * Convert raw DB rows (newest-first) into a WorkingContext.
	 * Rows in the same continuous_group are collapsed into a single ActivityEntry.
	 */
	static buildWorkingContextFromRows(rows: MobiusOperationRow[]): WorkingContext {
		// Group by continuous_group_id (null = standalone)
		const groups = new Map<string, MobiusOperationRow[]>();
		const standalone: MobiusOperationRow[] = [];

		for (const row of rows) {
			if (row.continuous_group_id) {
				const list = groups.get(row.continuous_group_id);
				if (list) {
					list.push(row);
				} else {
					groups.set(row.continuous_group_id, [row]);
				}
			} else {
				standalone.push(row);
			}
		}

		const activities: ActivityEntry[] = [];

		// Collapse grouped rows
		for (const [, groupRows] of groups) {
			const sorted = groupRows.sort((a, b) => a.created_at - b.created_at);
			const first = sorted[0];
			const allPaths = sorted.flatMap(extractRelatedPaths);
			const uniquePaths = [...new Set(allPaths)];
			const opType = ROW_TYPE_TO_OP[first.operation_type] ?? 'chat_message';

			let summary: string;
			if (sorted.length === 1) {
				summary = first.operation_desc ?? '';
			} else {
				const folder = uniquePaths.length > 0 ? parentFolder(uniquePaths[0]) : '';
				summary = `${capitalizeFirst(opType.replace(/_/g, ' '))} ×${sorted.length}` +
					(folder ? ` in ${folder}/` : '');
			}

			const meta = mergeMeta(sorted);

			activities.push({
				id: first.id,
				type: opType,
				timestamp: first.created_at,
				summary,
				relatedPaths: uniquePaths,
				importanceLevel: clampImportance(first.important_level),
				metadata: meta,
			});
		}

		// Standalone rows
		for (const row of standalone) {
			activities.push({
				id: row.id,
				type: ROW_TYPE_TO_OP[row.operation_type] ?? 'chat_message',
				timestamp: row.created_at,
				summary: row.operation_desc ?? '',
				relatedPaths: extractRelatedPaths(row),
				importanceLevel: clampImportance(row.important_level),
				metadata: safeParseMeta(row.meta_json),
			});
		}

		// Sort newest-first
		activities.sort((a, b) => b.timestamp - a.timestamp);

		const theme = SessionContextService.computeRuleBasedTheme(activities);

		return {
			activeFile: null,
			recentActivities: activities,
			workingTheme: { ruleBased: theme, llmInferred: null },
			updatedAt: Date.now(),
		};
	}

	/**
	 * Pure rule-based theme computation from a list of activities.
	 */
	static computeRuleBasedTheme(activities: ActivityEntry[]): WorkingTheme['ruleBased'] {
		const folderCounts = new Map<string, number>();
		const keywordCounts = new Map<string, number>();
		const tagCounts = new Map<string, number>();

		for (const act of activities) {
			// Folders from relatedPaths
			for (const p of act.relatedPaths) {
				const folder = parentFolder(p);
				folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
			}

			if (!act.metadata) continue;

			// Keywords from search_query metadata
			if (act.type === 'search_query' && typeof act.metadata.query === 'string') {
				const kw = act.metadata.query.trim();
				if (kw) keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
			}

			// Tags from file metadata
			if (Array.isArray(act.metadata.tags)) {
				for (const t of act.metadata.tags) {
					if (typeof t === 'string') {
						tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
					}
				}
			}
		}

		const topFolders = topN(folderCounts, 5);
		const topKeywords = topN(keywordCounts, 5);
		const topTags = topN(tagCounts, 5);

		const parts: string[] = [];
		if (topFolders.length > 0) parts.push(`Active in ${topFolders.slice(0, 2).join(', ')}`);
		if (topTags.length > 0) parts.push(`topics: ${topTags.slice(0, 3).map(t => `#${t}`).join(', ')}`);
		if (topKeywords.length > 0) parts.push(`recent searches: '${topKeywords.slice(0, 2).join("', '")}'`);

		return {
			topFolders,
			topKeywords,
			topTags,
			summary: parts.join(', ') || 'No recent activity',
		};
	}

	// ── Private ──────────────────────────────────────────────────────────────

	private async rebuildFromSqlite(): Promise<void> {
		try {
			const repo = SqliteStoreManager.getInstance().getMobiusOperationRepo();
			const sinceTs = Date.now() - DECAY_WINDOW_MS;
			const rows = await repo.getRecent({ limit: 200, sinceTs });
			this.context = SessionContextService.buildWorkingContextFromRows(rows);
		} catch (err) {
			console.warn('[SessionContextService] Failed to rebuild from SQLite', err);
		}
	}

	private subscribeEvents(): void {
		// EventBus events
		for (const [eventType, opType] of Object.entries(EVENT_TO_OP)) {
			const unsub = this.eventBus.on(eventType as ViewEventType, (event: any) => {
				this.handleBusEvent(opType!, event);
			});
			this.unsubscribers.push(unsub);
		}

		// Obsidian workspace file-open
		this.fileOpenRef = this.app.workspace.on('file-open', (file: TFile | null) => {
			this.handleFileOpen(file);
		});
	}

	private handleBusEvent(opType: OperationType, event: any): void {
		const summary = String(event?.operation_desc ?? event?.query ?? event?.summary ?? opType.replace(/_/g, ' '));
		const paths: string[] = [];
		if (typeof event?.path === 'string') paths.push(event.path);
		if (Array.isArray(event?.paths)) {
			for (const p of event.paths) {
				if (typeof p === 'string') paths.push(p);
			}
		}

		const metadata: Record<string, unknown> = {};
		if (typeof event?.query === 'string') metadata.query = event.query;
		if (Array.isArray(event?.tags)) metadata.tags = event.tags;

		this.recordActivity({
			type: opType,
			summary: summary.slice(0, 500),
			relatedPaths: paths,
			importanceLevel: typeof event?.importanceLevel === 'number' ? clampImportance(event.importanceLevel) : 0,
			metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
			relatedKind: typeof event?.relatedKind === 'string' ? event.relatedKind : null,
			relatedId: typeof event?.relatedId === 'string' ? event.relatedId : null,
		}).catch((err) => console.warn('[SessionContextService] recordActivity error', err));
	}

	private handleFileOpen(file: TFile | null): void {
		if (!file) return;

		const now = Date.now();
		this.context.activeFile = {
			path: file.path,
			title: file.basename ?? file.path,
			openedAt: now,
		};

		const meta: Record<string, unknown> = { path: file.path };
		// Try to get tags from metadata cache
		const cache = this.app.metadataCache?.getFileCache(file);
		if (cache?.frontmatter?.tags) {
			meta.tags = Array.isArray(cache.frontmatter.tags)
				? cache.frontmatter.tags
				: [cache.frontmatter.tags];
		}

		this.recordActivity({
			type: 'file_open',
			summary: `Opened ${file.basename ?? file.path}`,
			relatedPaths: [file.path],
			importanceLevel: 0,
			metadata: meta,
		}).catch((err) => console.warn('[SessionContextService] file-open recordActivity error', err));
	}

	private assignContinuousGroup(opType: string, now: number): string | null {
		const prev = this.lastOpByType.get(opType);
		let groupId: string;

		if (prev && (now - prev.ts) <= CONTINUOUS_GROUP_THRESHOLD_MS) {
			groupId = prev.groupId;
		} else {
			groupId = generateUuidWithoutHyphens();
		}

		this.lastOpByType.set(opType, { ts: now, groupId });
		return groupId;
	}

	private appendActivity(entry: ActivityEntry): void {
		this.context.recentActivities.unshift(entry);
		if (this.context.recentActivities.length > MAX_ACTIVITIES) {
			this.context.recentActivities.length = MAX_ACTIVITIES;
		}
		this.context.workingTheme.ruleBased = SessionContextService.computeRuleBasedTheme(
			this.context.recentActivities,
		);
		this.context.updatedAt = Date.now();
		this.themeInferrer.onActivity();
	}
}

// ─── Module-level helpers ────────────────────────────────────────────────────

function topN(counts: Map<string, number>, n: number): string[] {
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([key]) => key);
}

function clampImportance(value: number | null | undefined): 0 | 1 | 2 {
	if (value == null) return 0;
	if (value <= 0) return 0;
	if (value >= 2) return 2;
	return value as 0 | 1 | 2;
}

function capitalizeFirst(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function mergeMeta(rows: MobiusOperationRow[]): Record<string, unknown> | undefined {
	const merged: Record<string, unknown> = {};
	let hasAny = false;
	for (const row of rows) {
		const m = safeParseMeta(row.meta_json);
		if (m) {
			Object.assign(merged, m);
			hasAny = true;
		}
	}
	return hasAny ? merged : undefined;
}
